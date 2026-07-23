"use server";

import { auth } from "@clerk/nextjs/server";
import {
	getMessages,
	getOrCreateConversationForHost,
	getOrCreateConversationForSeekerApplication,
	markMessagesRead,
	recordEvent,
	sendMessage,
	type Message,
} from "@explore-and-earn/db";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { triggerDispatch } from "../../services/notifications/dispatcher";
import { checkRateLimitDistributed } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

export interface SendMessageActionResult {
	readonly ok: boolean;
	readonly error?: string;
}

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

		revalidatePath("/messages");
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

		revalidatePath("/host/messages");
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
 * revalidates the seeker + host message surfaces. Ownership and side detection
 * happen in `sendMessage`; this action only supplies the verified identity.
 */
async function sendMessageActionImpl(
	conversationId: string,
	body: string,
): Promise<SendMessageActionResult> {
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false, error: "unauthenticated" };

	// Rate limit: 30 messages per minute per user. Checked after auth, before any
	// DB work. Never throws — degrades to a friendly error code.
	const { allowed } = await checkRateLimitDistributed(`msg:${userId}`, 30, 60 * 1000);
	if (!allowed) return { ok: false, error: "rate_limit_exceeded" };

	const token = await getToken();
	if (!token) return { ok: false, error: "unauthenticated" };

	const result = await sendMessage(token, userId, conversationId, body);
	if (!result.ok) return result;

	// Persist the real message event: the notification engine notifies ONLY the
	// counterparty (thread-aware collapse turns a burst of replies into one
	// notification; the recipient's prefs/quiet hours/unsubscribe are honored;
	// message CONTENT never enters the notification payload). This replaces the
	// previous first-message-only inline email.
	if (result.senderRole) {
		await recordEvent({
			eventType: "message_sent",
			actorScope: result.senderRole,
			subjectType: "conversation",
			subjectId: conversationId,
			sourceSurface: "message_action",
			properties: { sender_role: result.senderRole },
		});
		after(triggerDispatch);
	}

	revalidatePath("/messages");
	revalidatePath(`/messages/${conversationId}`);
	revalidatePath("/host/messages");
	revalidatePath(`/host/messages/${conversationId}`);
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
		throw error;
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
