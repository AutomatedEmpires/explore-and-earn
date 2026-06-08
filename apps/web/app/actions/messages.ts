"use server";

import { auth } from "@clerk/nextjs/server";
import {
	countConversationMessages,
	getMessageEmailContext,
	getNotificationPrefs,
	sendMessage,
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

	const token = await getToken({ template: "supabase" });
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
