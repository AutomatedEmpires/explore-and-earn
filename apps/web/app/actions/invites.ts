"use server"

import { auth } from "@clerk/nextjs/server"
import {
	getSeekerInvites,
	respondToInvite,
	createInvite,
	getHostListings,
	getHostProfile,
	getHostClerkIdByProfileId,
	getNotificationPrefs,
	getSeekerClerkIdByProfileId,
	searchSeekersForInvite,
	withdrawInvite,
	type InviteResponse,
	type InviteWithListing,
	type SeekerSearchResult,
} from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"

import { getClerkContact } from "../../lib/clerkUser"
import { absoluteUrl, sendEmail } from "../../lib/email"
import { inviteAcceptedEmail, inviteEmail } from "../../lib/emails"
import { checkRateLimit } from "../../lib/rateLimit"
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
 * Server function: invites for the authenticated seeker (newest first).
 * Returns an empty list when unauthenticated rather than throwing, so the
 * /invites page can render its signed-out EmptyState.
 */
async function getInvitesActionImpl(): Promise<InviteWithListing[]> {
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
 * Host retracts a still-pending invite. Ownership + withdrawable-status are
 * enforced in the db layer; userId always from auth().userId.
 */
export async function withdrawInviteAction(
	inviteId: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId, getToken } = await auth()
		if (!userId) return { ok: false, error: "You must be signed in as a host." }
		const token = await getToken({ template: "supabase" })
		if (!token) return { ok: false, error: "Your session has expired — sign in again." }

		const result = await withdrawInvite(token, userId, inviteId)
		if (result.ok) revalidatePath("/host/invites")
		return result
	} catch (error) {
		reportError(error, { action: "withdrawInviteAction" })
		return { ok: false, error: "Could not withdraw the invite. Please try again." }
	}
}

export async function getInvitesAction(): Promise<InviteWithListing[]> {
	try {
		return await getInvitesActionImpl()
	} catch (error) {
		reportError(error, {
			action: "getInvitesAction",
			userId: await currentUserId(),
		})
		throw error
	}
}

/**
 * Server action: the authenticated seeker accepts or declines an invite, then
 * revalidates the invites surface. userId always comes from auth().userId — it
 * is never decoded from the token.
 *
 * On ACCEPT we additionally send a best-effort "invite accepted" email to the
 * host. Hosts have no notification-prefs row, so this is always sent; the whole
 * notification is wrapped so it can never block or fail the seeker's response.
 */
async function respondToInviteActionImpl(
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
	if (!result.ok) {
		return result
	}

	revalidatePath("/invites")

	if (response === "accepted") {
		try {
			const invites = await getSeekerInvites(token, userId).catch(
				() => [] as InviteWithListing[],
			)
			const match = invites.find((entry) => entry.invite.id === inviteId)
			if (match) {
				const hostClerkUserId = await getHostClerkIdByProfileId(
					token,
					match.invite.hostProfileId,
				)
				if (hostClerkUserId) {
					const [host, seeker] = await Promise.all([
						getClerkContact(hostClerkUserId),
						getClerkContact(userId),
					])
					if (host.email) {
						const seekerName = seeker.name ?? "A seeker"
						const listingTitle = match.listing?.title || "your listing"
						await sendEmail({
							to: host.email,
							subject: `${seekerName} accepted your invite to ${listingTitle}`,
							html: inviteAcceptedEmail({
								seekerName,
								listingTitle,
								applicantsUrl: absoluteUrl("/host/applicants"),
							}),
							template: "inviteAccepted",
							idempotencyKey: `inviteAccepted:${inviteId}`,
						})
					}
				}
			}
		} catch (err) {
			console.error(
				"[respondToInviteAction] accept email error (non-fatal):",
				err,
			)
		}
	}

	return result
}

export async function respondToInviteAction(
	inviteId: string,
	response: InviteResponse,
): Promise<{ ok: boolean; error?: string }> {
	try {
		return await respondToInviteActionImpl(inviteId, response)
	} catch (error) {
		reportError(error, {
			action: "respondToInviteAction",
			userId: await currentUserId(),
		})
		throw error
	}
}

/**
 * Shared host-invite creation path used by both createInviteAction and
 * sendInviteAction.
 *
 * - Resolves the caller's host profile (host_profile_id is required by the
 *   createInvite DB query and scopes ownership).
 * - Ownership validation: the listing must belong to the caller (via
 *   getHostListings).
 * - Deduplication: an existing invite for (listing_id, seeker_profile_id)
 *   surfaces as "already_invited" from the DB unique constraint.
 * - Email: best-effort via Resend — gated on the seeker's emailOnInvite
 *   preference, and errors are caught and never rethrown.
 *
 * userId ALWAYS from auth().userId — never decoded from a token.
 */
async function createInviteForCurrentHost(
	seekerProfileId: string,
	listingId: string,
	message?: string,
): Promise<{ ok: boolean; error?: string }> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	// Rate limit: 20 invites per hour per host. Checked after auth, before any DB
	// work. Never throws — degrades to a friendly error code.
	const { allowed } = checkRateLimit(`invite:${userId}`, 20, 60 * 60 * 1000)
	if (!allowed) {
		return { ok: false, error: "rate_limit_exceeded" }
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	// Resolve the host profile for the authed user.
	const hostProfile = await getHostProfile(token, userId).catch(() => null)
	if (!hostProfile) {
		return { ok: false, error: "profile_not_found" }
	}

	// Ownership check: listing must belong to this host.
	const listings = await getHostListings(token, userId).catch(() => [])
	const ownedListing = listings.find((row) => row.id === listingId)
	if (!ownedListing) {
		return { ok: false, error: "forbidden" }
	}

	// Insert the invite (deduplication enforced by DB UNIQUE constraint).
	const result = await createInvite(token, {
		hostProfileId: hostProfile.id,
		seekerProfileId,
		listingId,
		message,
		invitedByUserId: userId,
	})
	if (!result.ok) {
		return { ok: false, error: result.error }
	}

	revalidatePath("/host/invites")

	// Best-effort email notification — gated on the seeker's emailOnInvite pref;
	// errors are caught and never rethrown.
	try {
		const seekerClerkUserId = await getSeekerClerkIdByProfileId(
			token,
			seekerProfileId,
		).catch(() => null)

		if (seekerClerkUserId) {
			// Cross-user prefs read (host token, seeker userId) may fail under RLS;
			// degrade to sending rather than dropping the invite notification.
			let prefs = null
			try {
				prefs = await getNotificationPrefs(token, seekerClerkUserId)
			} catch {
				// Cross-user read failed; skip the notification prefs check.
			}

			if (prefs === null || prefs.emailOnInvite) {
				const contact = await getClerkContact(seekerClerkUserId)
				if (contact.email) {
					const hostName = hostProfile.companyName || "A host"
					const listingTitle = ownedListing.title
					const listingLocation =
						ownedListing.location_display ?? "Location not specified"
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
						template: "inviteEmail",
						idempotencyKey: result.inviteId
							? `inviteEmail:${result.inviteId}`
							: undefined,
					})
				}
			}
		}
	} catch (err) {
		console.error("[createInviteForCurrentHost] email error (non-fatal):", err)
	}

	return { ok: true }
}

/**
 * Server action: the authenticated host invites a seeker to one of their own
 * listings. Thin wrapper over createInviteForCurrentHost (no custom message).
 */
export async function createInviteAction(
	seekerProfileId: string,
	listingId: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		return await createInviteForCurrentHost(seekerProfileId, listingId)
	} catch (error) {
		reportError(error, {
			action: "createInviteAction",
			userId: await currentUserId(),
		})
		throw error
	}
}

/**
 * Server action: same as createInviteAction but carries an optional personal
 * message (used by the SeekerSearchDrawer compose step). Retained as a distinct
 * export for the drawer's message-compose flow.
 */
export async function sendInviteAction(
	seekerProfileId: string,
	listingId: string,
	message?: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		return await createInviteForCurrentHost(seekerProfileId, listingId, message)
	} catch (error) {
		reportError(error, {
			action: "sendInviteAction",
			userId: await currentUserId(),
		})
		throw error
	}
}

/**
 * Server action: search seeker profiles by name/bio for the invite drawer.
 * Returns empty when unauthenticated or no host profile exists.
 *
 * userId ALWAYS from auth().userId — never decoded from a token.
 */
async function searchSeekersActionImpl(
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

export async function searchSeekersAction(
	query: string,
): Promise<SeekerSearchResult[]> {
	try {
		return await searchSeekersActionImpl(query)
	} catch (error) {
		reportError(error, {
			action: "searchSeekersAction",
			userId: await currentUserId(),
		})
		throw error
	}
}
