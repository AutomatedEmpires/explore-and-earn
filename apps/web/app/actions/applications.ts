"use server"

import { auth } from "@clerk/nextjs/server"
import {
	applyToListing,
	getListingHostContact,
	getSeekerApplicationIds,
	type ApplyResult,
} from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"

import { getClerkContact } from "../../lib/clerkUser"
import { absoluteUrl, sendEmail } from "../../lib/email"
import { applicationReceivedEmail } from "../../lib/emails"

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

	const result = await applyToListing(token, userId, listingId, coverMessage)

	// Best-effort: email the host that a new application arrived. This must never
	// block or fail the apply result, so all of it is guarded and swallowed.
	if (result.ok) {
		try {
			const listingContact = await getListingHostContact(token, listingId)
			if (listingContact?.hostClerkUserId) {
				const [hostContact, seekerContact] = await Promise.all([
					getClerkContact(listingContact.hostClerkUserId),
					getClerkContact(userId),
				])
				if (hostContact.email) {
					const seekerName = seekerContact.name ?? "A seeker"
					const listingTitle = listingContact.listingTitle || "your listing"
					await sendEmail({
						to: hostContact.email,
						subject: `${seekerName} applied to ${listingTitle}`,
						html: applicationReceivedEmail({
							seekerName,
							listingTitle,
							reviewUrl: absoluteUrl("/host/applicants"),
						}),
					})
				}
			}
		} catch {
			// best-effort notification; ignore failures
		}
	}

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

	return getSeekerApplicationIds(token, userId)
}
