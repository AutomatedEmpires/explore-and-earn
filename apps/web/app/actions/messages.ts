"use server";

import { auth } from "@clerk/nextjs/server";
import { getMessageEmailContext, sendMessage } from "@explore-and-earn/db";
import { revalidatePath } from "next/cache";

import { getClerkContact } from "../../lib/clerkUser";
import { absoluteUrl, sendEmail } from "../../lib/email";
import { newMessageEmail } from "../../lib/emails";

export interface SendMessageActionResult {
	readonly ok: boolean;
	readonly error?: string;
}

/**
 * Sends a reply in a conversation the signed-in user participates in, then
 * revalidates the seeker + host message surfaces. Ownership and side detection
 * happen in `sendMessage`; this action only supplies the verified identity.
 */
export async function sendMessageAction(
	conversationId: string,
	body: string,
): Promise<SendMessageActionResult> {
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false, error: "unauthenticated" };

	const token = await getToken({ template: "supabase" });
	if (!token) return { ok: false, error: "unauthenticated" };

	const result = await sendMessage(token, userId, conversationId, body);
	if (!result.ok) return result;

	// Best-effort: email the OTHER participant about the new message. The sender
	// is the current user; the recipient + listing come from the conversation.
	try {
		const context = await getMessageEmailContext(token, userId, conversationId);
		if (context?.recipientClerkUserId) {
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
				});
			}
		}
	} catch {
		// best-effort notification; ignore failures
	}

	revalidatePath("/messages");
	revalidatePath(`/messages/${conversationId}`);
	revalidatePath("/host/messages");
	revalidatePath(`/host/messages/${conversationId}`);
	return { ok: true };
}
