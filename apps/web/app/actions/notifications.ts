"use server"

import { auth } from "@clerk/nextjs/server"
import { markAllNotificationsRead, markNotificationRead } from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"

import { reportError } from "../../lib/sentry"

/** Best-effort current Clerk user id for error attribution (catch paths only). */
async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined
	} catch {
		return undefined
	}
}

/**
 * Server action: mark one of the authenticated seeker's notifications as read.
 *
 * Auth is enforced here (Clerk) before any DB work; the Supabase JWT is minted
 * via the "supabase" Clerk JWT template and handed to the db layer, which also
 * applies an app-level ownership guard. Returns `{ ok: false }` when signed out
 * or the write does not apply.
 */
async function markNotificationReadActionImpl(
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
	revalidatePath("/", "layout")
	return result
}

export async function markNotificationReadAction(
	notificationId: string,
): Promise<{ ok: boolean }> {
	try {
		return await markNotificationReadActionImpl(notificationId)
	} catch (error) {
		reportError(error, {
			action: "markNotificationReadAction",
			userId: await currentUserId(),
		})
		throw error
	}
}

/** Mark every unread notification for the authenticated seeker as read. */
async function markAllNotificationsReadActionImpl(): Promise<{ ok: boolean }> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false }
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return { ok: false }
	}

	const result = await markAllNotificationsRead(token, userId)
	revalidatePath("/notifications")
	revalidatePath("/", "layout")
	return result
}

export async function markAllNotificationsReadAction(): Promise<{ ok: boolean }> {
	try {
		return await markAllNotificationsReadActionImpl()
	} catch (error) {
		reportError(error, {
			action: "markAllNotificationsReadAction",
			userId: await currentUserId(),
		})
		throw error
	}
}
