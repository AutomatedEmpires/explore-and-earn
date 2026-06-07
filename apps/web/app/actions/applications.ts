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
import { checkRateLimit } from "../../lib/rateLimit"

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

	// Rate limit: 5 applications per hour per user. Checked after auth, before any
	// DB work. Never throws — degrades to a friendly error code.
	const { allowed } = checkRateLimit(`apply:${userId}`, 5, 60 * 60 * 1000)
	if (!allowed) {
		return { ok: false, error: "rate_limit_exceeded" }
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await applyToListing(token, userId, listingId, coverMessage)

	if (result.error === "cannot_apply_to_own_listing") {
		return { ok: false, error: "You cannot apply to your own listing." }
	}

	// Best-effort: email the host that a new application arrived. This must never
	// block or fail the apply result, so all of it is guarded and swallowed.
	// Hosts have no notification-prefs flag for this, so it is always sent.
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
						template: "applicationReceived",
					})
				}
			}
		} catch (e) {
			console.error("[email] application notification failed:", e);
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
