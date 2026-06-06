"use server"

import { auth } from "@clerk/nextjs/server"
import {
	applyToListing,
	getSeekerApplicationIds,
	type ApplyResult,
} from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"

/**
 * Server action: apply the authenticated seeker to a listing.
 *
 * Auth is enforced here (Clerk) before any DB work; the Supabase JWT is minted
 * via the "supabase" Clerk JWT template and handed to the db layer.
 */
export async function applyToListingAction(
	listingId: string,
	coverMessage?: string,
): Promise<ApplyResult> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await applyToListing(token, listingId, coverMessage)

	// TODO(notifications): insert a host notification on successful apply.
	// Requires a service-role token (not the seeker JWT) to write to a
	// host-owned row — safe cross-user writes land with the service-role key.

	revalidatePath(`/listing/${listingId}`)
	return result
}

/** Server action: listing ids the authenticated seeker has applied to. */
export async function getSeekerApplicationIdsAction(): Promise<string[]> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return []
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return []
	}

	return getSeekerApplicationIds(token)
}
