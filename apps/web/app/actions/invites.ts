"use server"

import { auth } from "@clerk/nextjs/server"
import {
	getSeekerInvites,
	respondToInvite,
	createInviteWithEntitlement,
	getHostListings,
	getHostProfile,
	recordEvent,
	restoreInviteCreditForInvite,
	searchSeekersForInvite,
	withdrawInvite,
	type InviteResponse,
	type InviteWithListing,
	type SeekerSearchResult,
} from "@explore-and-earn/db"
import { MONTHLY_INVITE_QUOTA } from "@explore-and-earn/contracts"
import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { triggerDispatch } from "../../services/notifications/dispatcher"
import { checkRateLimitDistributed } from "../../lib/rateLimit"
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

	const token = await getToken()
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
		const token = await getToken()
		if (!token) return { ok: false, error: "Your session has expired — sign in again." }

		// Only a never-delivered invite ('created') hands its credit back.
		// wasUndelivered comes from the withdraw UPDATE itself (atomic — see
		// withdrawInvite), so a seeker responding concurrently can never cause
		// a restore for an invite that was actually delivered.
		const result = await withdrawInvite(token, userId, inviteId)
		if (result.ok) {
			if (result.wasUndelivered) {
				// Idempotent (one restore per invite, enforced in SQL); false pre-061.
				await restoreInviteCreditForInvite(inviteId)
			}
			revalidatePath("/host/outreach")
		}
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

	const token = await getToken()
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await respondToInvite(token, userId, inviteId, response)
	if (!result.ok) {
		return result
	}

	revalidatePath("/invites")

	if (response === "accepted" && result.applicationId) {
		// Accepting an invite now produces a REAL application, so the host is
		// notified through the canonical application_submitted path — the same
		// event a direct apply emits, pointing at an applicant that actually
		// exists in /host/applicants.
		//
		// This REPLACES a bespoke inline "accepted your invite" email that could
		// never fire: it looked the invite up via getSeekerInvites AFTER the
		// status became 'applied', and that query excludes applied invites, so
		// the lookup always missed and the host was told nothing at all.
		//
		// properties.source lets the taxonomy render invite-aware copy while
		// staying one event type (no parallel notification path).
		await recordEvent({
			eventType: "application_submitted",
			actorScope: "seeker",
			subjectType: "application",
			subjectId: result.applicationId,
			...(result.listingId ? { listingId: result.listingId } : {}),
			sourceSurface: "invite_accept_action",
			properties: { source: "invite", inviteId },
		})
		after(triggerDispatch)
		revalidatePath("/applied")
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
	const { allowed } = await checkRateLimitDistributed(`invite:${userId}`, 20, 60 * 60 * 1000)
	if (!allowed) {
		return { ok: false, error: "rate_limit_exceeded" }
	}

	// Action-boundary cap matching the compose textarea's maxLength (500) — only
	// a scripted caller can exceed it.
	if (typeof message === "string" && message.length > 500) {
		return { ok: false, error: "message_too_long" }
	}

	const token = await getToken()
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

	// Insert the invite with SERVER-ENFORCED entitlement: the monthly allowance
	// comes from the host's real subscription tier (never a client value), and
	// the SQL function consumes the credit atomically with the insert — a
	// concurrent double-send can never overspend, and a duplicate
	// (listing, seeker) pair spends nothing. 'invite_credits_required' is the
	// blocked-upsell state (buy a pack or upgrade the plan).
	const monthlyAllowance = MONTHLY_INVITE_QUOTA[hostProfile.subscriptionTier]
	const result = await createInviteWithEntitlement(
		token,
		{
			hostProfileId: hostProfile.id,
			seekerProfileId,
			listingId,
			message,
			invitedByUserId: userId,
		},
		monthlyAllowance,
	)
	if (!result.ok) {
		return { ok: false, error: result.error }
	}

	revalidatePath("/host/outreach")

	// Persist the real invite event: the notification engine derives the
	// seeker's in-app/email/push notification from it (localized, deduped per
	// invite, preference-/quiet-hours-/unsubscribe-aware — replaces the inline
	// email; the seeker's legacy email_on_invite opt-out keeps holding via the
	// engine's legacy-boolean overlay).
	await recordEvent({
		eventType: "invite_created",
		actorScope: "host",
		subjectType: "invite",
		subjectId: result.inviteId,
		listingId,
		hostProfileId: hostProfile.id,
		seekerProfileId,
		sourceSurface: "invite_action",
	})
	after(triggerDispatch)

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

	// Rate limit: 30 searches per hour per user. This action reads seeker names
	// and bios, so a scripted caller must not be able to enumerate profiles at
	// speed (the db layer additionally requires a host profile and caps results).
	const { allowed } = await checkRateLimitDistributed(`seeker-search:${userId}`, 30, 60 * 60 * 1000)
	if (!allowed) {
		return []
	}

	const token = await getToken()
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
