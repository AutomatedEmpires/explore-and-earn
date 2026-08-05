"use server";

import { auth } from "@clerk/nextjs/server";
import {
	getMessages,
	getOrCreateConversationForHost,
	getOrCreateConversationForSeekerApplication,
	markMessagesRead,
	sendMessage,
	type Message,
} from "@explore-and-earn/db";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { triggerDispatch } from "../../services/notifications/dispatcher";
import { checkRateLimitDistributed } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

export type SendMessageFailureCode =
	| "unauthenticated"
	| "rate_limit_exceeded"
	| "conversation_unavailable"
	| "invalid_message"
	| "delivery_unconfirmed";

export type SendMessageActionResult =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly error: SendMessageFailureCode;
			readonly retryable: boolean;
	  };

export interface OpenConversationActionResult {
	readonly ok: boolean;
	readonly conversationId?: string;
	readonly error?: "unauthenticated" | "rate_limit_exceeded" | "unavailable";
}

async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined;
	} catch {
		return undefined;
	}
}

async function conversationOpenIdentity(): Promise<
	| { readonly userId: string; readonly token: string }
	| OpenConversationActionResult
> {
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false, error: "unauthenticated" };

	const { allowed } = await checkRateLimitDistributed(
		`conversation-open:${userId}`,
		30,
		5 * 60 * 1000,
	);
	if (!allowed) return { ok: false, error: "rate_limit_exceeded" };

	const token = await getToken();
	if (!token) return { ok: false, error: "unauthenticated" };
	return { userId, token };
}

/** Explicit POST boundary for a seeker opening their application's thread. */
export async function openSeekerApplicationConversationAction(
	applicationId: string,
): Promise<OpenConversationActionResult> {
	try {
		if (!applicationId) return { ok: false, error: "unavailable" };
		const identity = await conversationOpenIdentity();
		if ("ok" in identity) return identity;

		const conversation = await getOrCreateConversationForSeekerApplication(
			identity.token,
			identity.userId,
			applicationId,
		);
		if (!conversation) return { ok: false, error: "unavailable" };

		try {
			revalidatePath("/messages");
		} catch (error) {
			// The conversation is already durable and idempotent. Cache freshness
			// cannot turn a successful open into a false failure.
			reportError(error, {
				action: "openSeekerApplicationConversationAction.postPersistRevalidate",
				userId: identity.userId,
			});
		}
		return { ok: true, conversationId: conversation.id };
	} catch (error) {
		reportError(error, {
			action: "openSeekerApplicationConversationAction",
			userId: await currentUserId(),
		});
		// During deploys the web SHA becomes live before its migration workflow.
		// Treat a temporarily unavailable RPC like any other unavailable thread.
		return { ok: false, error: "unavailable" };
	}
}

/** Explicit POST boundary for a host opening one exact applicant thread. */
export async function openHostApplicationConversationAction(
	seekerProfileId: string,
	applicationId: string,
): Promise<OpenConversationActionResult> {
	try {
		if (!seekerProfileId || !applicationId) {
			return { ok: false, error: "unavailable" };
		}
		const identity = await conversationOpenIdentity();
		if ("ok" in identity) return identity;

		const conversation = await getOrCreateConversationForHost(
			identity.token,
			identity.userId,
			seekerProfileId,
			applicationId,
		);
		if (!conversation) return { ok: false, error: "unavailable" };

		try {
			revalidatePath("/host/messages");
		} catch (error) {
			reportError(error, {
				action: "openHostApplicationConversationAction.postPersistRevalidate",
				userId: identity.userId,
			});
		}
		return { ok: true, conversationId: conversation.id };
	} catch (error) {
		reportError(error, {
			action: "openHostApplicationConversationAction",
			userId: await currentUserId(),
		});
		return { ok: false, error: "unavailable" };
	}
}

/**
 * Sends a reply in a conversation the signed-in user participates in, then
 * revalidates the seeker + host message surfaces. Ownership, side detection,
 * message persistence, and the canonical event all happen in one database
 * transaction; this action supplies only the caller's short-lived token.
 */
async function sendMessageActionImpl(
	conversationId: string,
	body: string,
): Promise<SendMessageActionResult> {
	const { userId, getToken } = await auth();
	if (!userId) {
		return { ok: false, error: "unauthenticated", retryable: false };
	}

	// Rate limit: 30 messages per minute per user. Checked after auth, before any
	// DB work. Never throws — degrades to a friendly error code.
	const { allowed } = await checkRateLimitDistributed(`msg:${userId}`, 30, 60 * 1000);
	if (!allowed) {
		return { ok: false, error: "rate_limit_exceeded", retryable: true };
	}

	const token = await getToken();
	if (!token) {
		return { ok: false, error: "unauthenticated", retryable: false };
	}

	const result = await sendMessage(token, conversationId, body);
	if (!result.ok) {
		switch (result.error) {
			case "empty":
			case "too_long":
				return { ok: false, error: "invalid_message", retryable: false };
			case "not_found":
				return {
					ok: false,
					error: "conversation_unavailable",
					retryable: false,
				};
			default:
				// A transport failure can happen after Postgres accepted the INSERT
				// but before the client received the response. Never tell the sender
				// the message was not sent when delivery is genuinely ambiguous.
				return {
					ok: false,
					error: "delivery_unconfirmed",
					retryable: true,
				};
		}
	}

	// The transactional trigger has already committed the message_sent event.
	// Wake the dispatcher after the response without creating a second event.
	// Notification delivery remains best-effort; the durable outbox is the retry
	// source if this process exits before dispatch begins.
	try {
		after(triggerDispatch);
	} catch (error) {
		reportError(error, {
			action: "sendMessageAction.postPersistDispatch",
			userId,
		});
	}

	try {
		revalidatePath("/messages");
		revalidatePath(`/messages/${conversationId}`);
		revalidatePath("/host/messages");
		revalidatePath(`/host/messages/${conversationId}`);
	} catch (error) {
		// Revalidation affects freshness, not whether the INSERT happened.
		reportError(error, {
			action: "sendMessageAction.postPersistRevalidate",
			userId,
		});
	}
	return { ok: true };
}

export async function sendMessageAction(
	conversationId: string,
	body: string,
): Promise<SendMessageActionResult> {
	try {
		return await sendMessageActionImpl(conversationId, body);
	} catch (error) {
		reportError(error, {
			action: "sendMessageAction",
			userId: await currentUserId(),
		});
		return {
			ok: false,
			error: "delivery_unconfirmed",
			retryable: true,
		};
	}
}

export interface FetchMessagesActionResult {
	readonly ok: boolean;
	readonly messages: readonly Message[];
}

/**
 * Returns the current transcript for a conversation the signed-in user
 * participates in — the RLS-scoped read the client transcript polls so a
 * counterpart's replies appear without a manual refresh. (Supabase Realtime for
 * `messages` needs an authenticated socket to satisfy the post-048 RLS SELECT
 * policy; the short-lived Clerk token makes a live client channel impractical,
 * so we poll this instead.) Best-effort: returns an empty list rather than
 * throwing, so a transient failure never breaks the open thread.
 */
export async function fetchConversationMessagesAction(
	conversationId: string,
): Promise<FetchMessagesActionResult> {
	try {
		const { userId, getToken } = await auth();
		if (!userId) return { ok: false, messages: [] };
		const token = await getToken();
		if (!token) return { ok: false, messages: [] };
		const messages = await getMessages(token, userId, conversationId);
		return { ok: true, messages };
	} catch (error) {
		reportError(error, {
			action: "fetchConversationMessagesAction",
			userId: await currentUserId(),
		});
		return { ok: false, messages: [] };
	}
}

/**
 * Marks all inbound (from the other participant) messages in a conversation as
 * read for the signed-in user. Called server-side when a thread page loads so
 * unread counts in the list view and header badge are accurate. Best-effort —
 * silently no-ops when the caller is not authenticated or not a participant.
 */
export async function markMessagesReadAction(
	conversationId: string,
): Promise<void> {
	try {
		const { userId, getToken } = await auth();
		if (!userId) return;
		const token = await getToken();
		if (!token) return;

		await markMessagesRead(token, userId, conversationId);

		// Revalidate the list pages so unread dots and header badge update.
		revalidatePath("/messages");
		revalidatePath("/host/messages");
	} catch (error) {
		// Never throw — a failed mark-read must not break the page render.
		reportError(error, {
			action: "markMessagesReadAction",
			userId: await currentUserId(),
		});
	}
}
