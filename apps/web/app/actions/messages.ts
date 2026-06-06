"use server";

import { auth } from "@clerk/nextjs/server";
import { sendMessage } from "@explore-and-earn/db";
import { revalidatePath } from "next/cache";

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

	revalidatePath("/messages");
	revalidatePath(`/messages/${conversationId}`);
	revalidatePath("/host/messages");
	revalidatePath(`/host/messages/${conversationId}`);
	return { ok: true };
}
