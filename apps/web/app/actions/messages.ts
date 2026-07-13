"use server";

import { auth } from "@clerk/nextjs/server";
import {
	countConversationMessages,
	getMessageEmailContext,
	getMessages,
	getNotificationPrefs,
	markMessagesRead,
	sendMessage,
	type Message,
} from "@explore-and-earn/db";
import { revalidatePath } from "next/cache";

import { getClerkContact } from "../../lib/clerkUser";
import { absoluteUrl, sendEmail } from "../../lib/email";
import { newMessageEmail } from "../../lib/emails";
import { checkRateLimit } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

export interface SendMessageActionResult {
	readonly ok: boolean;
	readonly error?: string;
}

async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined;
	} catch {
		return undefined;
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
	const { allowed } = checkRateLimit(`msg:${userId}`, 30, 60 * 1000);
	if (!allowed) return { ok: false, error: "rate_limit_exceeded" };

	const token = await getToken();
	if (!token) return { ok: false, error: "unauthenticated" };

	const result = await sendMessage(token, userId, conversationId, body);
	if (!result.ok) return result;

	// Best-effort: email the OTHER participant — but ONLY for the FIRST message in
	// a thread, never on every reply. After a successful insert the conversation
	// has exactly one message iff this was the opening message. The sender is the
	// current user; the recipient + listing come from the conversation. Seekers
	// can opt out of new-message emails; hosts have no preference row, so host
	// recipients are always emailed.
	try {
		const messageCount = await countConversationMessages(token, conversationId);
		if (messageCount === 1) {
			const context = await getMessageEmailContext(
				token,
				userId,
				conversationId,
			);
			if (context?.recipientClerkUserId) {
				let recipientOptedOut = false;
				if (context.recipientRole === "seeker") {
					// Cross-user prefs read: recipient is a different user from the sender,
					// so the sender's token may fail under RLS. Degrade silently.
					let prefs = null;
					try {
						prefs = await getNotificationPrefs(
							token,
							context.recipientClerkUserId,
						);
					} catch {
						// Cross-user read failed; skip notification prefs check.
					}
					recipientOptedOut = prefs !== null && !prefs.emailOnMessage;
				}
				if (!recipientOptedOut) {
					const [recipient, sender] = await Promise.all([
						getClerkContact(context.recipientClerkUserId),
						getClerkContact(userId),
					]);
					if (recipient.email) {
						const listingTitle = context.listingTitle || "your conversation";
						const conversationPath =
							context.recipientRole === "host"
								? `/host/messages/${conversationId}`
								: `/messages/${conversationId}`;
						await sendEmail({
							to: recipient.email,
							subject: `New message about ${listingTitle}`,
							html: newMessageEmail({
								senderName: sender.name ?? "Someone",
								listingTitle,
								messagePreview: body,
								conversationUrl: absoluteUrl(conversationPath),
							}),
							template: "newMessage",
							// Idempotency key scoped to the conversation: because the email is
							// only sent when messageCount === 1 (first message), this key is
							// unique per conversation send event and guards against retried
							// action calls sending the same opening-message notification twice.
							idempotencyKey: `newMessage:${conversationId}`,
						});
					}
				}
			}
		}
	} catch (e) {
		console.error("[email] message notification failed:", e);
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
