"use server"

import { auth } from "@clerk/nextjs/server"
import {
	getSeekerInvites,
	respondToInvite,
	createInvite,
	getHostListings,
	getHostProfile,
	getSeekerClerkIdByProfileId,
	searchSeekersForInvite,
	type InviteResponse,
	type InviteWithListing,
	type SeekerSearchResult,
} from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"

import { getClerkContact } from "../../lib/clerkUser"
import { absoluteUrl, sendEmail } from "../../lib/email"
import { inviteEmail } from "../../lib/emails"
import { checkRateLimit } from "../../lib/rateLimit"

/**
 * Server function: invites for the authenticated seeker (newest first).
 * Returns an empty list when unauthenticated rather than throwing, so the
 * /invites page can render its signed-out EmptyState.
 */
export async function getInvitesAction(): Promise<InviteWithListing[]> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return []
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return []
	}

	return getSeekerInvites(token, userId)
}

/**
 * Server action: the authenticated seeker accepts or declines an invite, then
 * revalidates the invites surface. userId always comes from auth().userId — it
 * is never decoded from the token.
 */
export async function respondToInviteAction(
	inviteId: string,
	response: InviteResponse,
): Promise<{ ok: boolean; error?: string }> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await respondToInvite(token, userId, inviteId, response)
	if (result.ok) revalidatePath("/invites")
	return result
}

/**
 * Server action: the authenticated host sends an invite to a seeker for one of
 * their own listings.
 *
 * Ownership validation: the listing must belong to the caller (via getHostListings).
 * Deduplication: existing invite for (listing_id, seeker_profile_id) surfaces
 * as "already_invited".
 * Email: best-effort via Resend — errors are caught and never rethrown.
 *
 * userId ALWAYS from auth().userId — never decoded from a token.
 */
export async function sendInviteAction(
	seekerProfileId: string,
	listingId: string,
	message?: string,
): Promise<{ ok: boolean; error?: string }> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	// Rate limit: 20 invites per hour per host. checkRateLimit never throws.
	const { allowed } = checkRateLimit(`invite:${userId}`, 20, 60 * 60 * 1000)
	if (!allowed) {
		return { ok: false, error: "rate_limit_exceeded" }
	}

	// Ownership check: listing must belong to this host.
	const listings = await getHostListings(token, userId).catch(() => [])
	const ownedListing = listings.find((row) => row.id === listingId)
	if (!ownedListing) {
		return { ok: false, error: "forbidden" }
	}

	// Insert the invite (deduplication enforced by DB UNIQUE constraint).
	const result = await createInvite(token, userId, listingId, seekerProfileId, message)
	if (!result.ok) {
		return result
	}

	revalidatePath("/host/invites")

	// Best-effort email notification — errors are caught and never rethrown.
	try {
		const [hostProfile, seekerClerkUserId] = await Promise.all([
			getHostProfile(token, userId).catch(() => null),
			getSeekerClerkIdByProfileId(token, seekerProfileId).catch(() => null),
		])

		if (seekerClerkUserId) {
			const contact = await getClerkContact(seekerClerkUserId)
			if (contact.email) {
				const hostName = hostProfile?.companyName ?? "A host"
				const listingTitle = ownedListing.title
				const listingLocation = ownedListing.location_display ?? "Location not specified"
				const html = inviteEmail({
					hostName,
					listingTitle,
					listingLocation,
					message: message ?? null,
					inviteUrl: absoluteUrl("/invites"),
				})
				await sendEmail({
					to: contact.email,
					subject: `${hostName} invited you to apply to ${listingTitle}`,
					html,
				})
			}
		}
	} catch (err) {
		console.error("[sendInviteAction] email error (non-fatal):", err)
	}

	return { ok: true }
}

/**
 * Server action: search seeker profiles by name/bio for the invite drawer.
 * Returns empty when unauthenticated or no host profile exists.
 *
 * userId ALWAYS from auth().userId — never decoded from a token.
 */
export async function searchSeekersAction(
	query: string,
): Promise<SeekerSearchResult[]> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return []
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return []
	}

	return searchSeekersForInvite(token, userId, query).catch(() => [])
}
