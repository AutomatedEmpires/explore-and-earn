"use server"

import { auth } from "@clerk/nextjs/server"
import { markNotificationRead } from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"

/**
 * Server action: mark one of the authenticated seeker's notifications as read.
 *
 * Auth is enforced here (Clerk) before any DB work; the Supabase JWT is minted
 * via the "supabase" Clerk JWT template and handed to the db layer, which also
 * applies an app-level ownership guard. Returns `{ ok: false }` when signed out
 * or the write does not apply.
 */
export async function markNotificationReadAction(
	notificationId: string,
): Promise<{ ok: boolean }> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false }
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return { ok: false }
	}

	const result = await markNotificationRead(token, userId, notificationId)
	revalidatePath("/notifications")
	return result
}
