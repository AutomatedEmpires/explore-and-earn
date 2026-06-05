"use server"

import { auth } from "@clerk/nextjs/server"
import { createHostProfile } from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"

/**
 * Server action: create a host profile for the authenticated user.
 *
 * Auth is enforced here (Clerk) before any DB work; the Supabase-compatible JWT
 * is minted via the "supabase" Clerk JWT template and handed to the db layer,
 * along with the verified `userId` used as the app-level ownership scope.
 */
export async function createHostProfileAction(
	companyName: string,
): Promise<{ ok: boolean; error?: string }> {
	const trimmed = companyName.trim()
	if (!trimmed) {
		return { ok: false, error: "name_required" }
	}

	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await createHostProfile(token, userId, trimmed)
	if (!result.ok) {
		return { ok: false, error: "create_failed" }
	}

	revalidatePath("/host")
	return { ok: true }
}
