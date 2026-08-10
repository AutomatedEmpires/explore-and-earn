"use server"

import { auth } from "@clerk/nextjs/server"
import {
	getSeekerInvites,
	respondToInvite,
	createInviteWithEntitlement,
	getHostListings,
	getHostProfile,
	recordEvent,
	searchSeekersForInvite,
	withdrawInvite,
	type InviteResponse,
	type InviteWithListing,
	type WithdrawInviteResult,
	type HostDiscoveryError,
	type SeekerSearchResult,
} from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { triggerDispatch } from "../../services/notifications/dispatcher"
import { checkRateLimitDistributed } from "../../lib/rateLimit"
import { reportError } from "../../lib/sentry"
import {
	isValidOutreachId,
	normalizeSeekerSearchRequest,
	type HostDiscoveryActionError,
} from "../../lib/hostOutreach"

/** Best-effort current Clerk user id for error attribution (catch paths only). */
async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined
	} catch {
		return undefined
	}
}

/** Postgres char_length parity without scanning beyond the rejection point. */
function exceedsCodePointLimit(value: string, limit: number): boolean {
	let count = 0
	for (const codePoint of value) {
		if (codePoint.length > 0) count += 1
		if (count > limit) return true
	}
	return false
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
type WithdrawInviteActionResult =
	| Extract<WithdrawInviteResult, { readonly ok: true }>
	| { readonly ok: false; readonly error: string }

export async function withdrawInviteAction(
	inviteId: string,
): Promise<WithdrawInviteActionResult> {
	try {
		const { userId, getToken } = await auth()
		if (!userId) return { ok: false, error: "You must be signed in as a host." }
		const token = await getToken()
		if (!token) return { ok: false, error: "Your session has expired — sign in again." }

		const result = await withdrawInvite(token, userId, inviteId)
		if (result.ok) {
			try {
				revalidatePath("/host/outreach")
			} catch (error) {
				reportError(error, {
					action: "withdrawInviteAction.revalidate",
					userId,
				})
			}
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

	try {
		revalidatePath("/invites")
	} catch (error) {
		reportError(error, {
			action: "respondToInviteAction.revalidateInvites",
			userId,
		})
	}

	if (
		response === "accepted" &&
		result.applicationId &&
		(result.disposition === "created" || result.disposition === "reactivated")
	) {
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
		// An `existing` disposition only adopts/links an application that was
		// already durable, so it intentionally emits no duplicate submission.
		// properties.source lets the taxonomy render invite-aware copy while
		// staying one event type (no parallel notification path).
		try {
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
		} catch (error) {
			reportError(error, {
				action: "respondToInviteAction.notification",
				userId,
			})
		}
		try {
			revalidatePath("/applied")
		} catch (error) {
			reportError(error, {
				action: "respondToInviteAction.revalidateApplied",
				userId,
			})
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
	if (!isValidOutreachId(seekerProfileId) || !isValidOutreachId(listingId)) {
		return { ok: false, error: "invalid_request" }
	}

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
	if (typeof message === "string" && exceedsCodePointLimit(message, 500)) {
		return { ok: false, error: "message_too_long" }
	}

	const token = await getToken()
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	// Resolve the host profile for the authed user.
	let hostProfile
	try {
		hostProfile = await getHostProfile(token, userId)
	} catch {
		return { ok: false, error: "temporarily_unavailable" }
	}
	if (!hostProfile) {
		return { ok: false, error: "profile_not_found" }
	}

	// Ownership check: listing must belong to this host.
	let listings
	try {
		listings = await getHostListings(token, userId)
	} catch {
		return { ok: false, error: "temporarily_unavailable" }
	}
	const ownedListing = listings.find((row) => row.id === listingId)
	if (!ownedListing) {
		return { ok: false, error: "forbidden" }
	}

	// Insert through the versioned 094 authority. The database derives the
	// current subscription tier and monthly allowance inside the same locked
	// transaction; no caller-provided quota can authorize spend. The function
	// consumes the credit atomically with the insert — a
	// concurrent double-send can never overspend, and a duplicate
	// (listing, seeker) pair spends nothing. 'invite_credits_required' is the
	// blocked-upsell state (buy a pack or upgrade the plan).
	const result = await createInviteWithEntitlement(
		token,
		{
			hostProfileId: hostProfile.id,
			seekerProfileId,
			listingId,
			message,
		},
	)
	if (!result.ok) {
		return { ok: false, error: result.error }
	}

	// The invite + credit debit are already durable. Cache invalidation must not
	// turn that success into a retryable-looking failure and duplicate the host's
	// intent; the next navigation can reconcile even if this best-effort refresh
	// is unavailable.
	try {
		revalidatePath("/host/outreach")
	} catch (error) {
		reportError(error, {
			action: "createInviteForCurrentHost.revalidate",
			userId,
		})
	}

	// The versioned database authority persists the canonical invite_created
	// event in the same transaction as the invite and credit debit. Triggering
	// the dispatcher is therefore only a best-effort wake-up; the sweeper can
	// always expand the durable event later, and there is no invite-without-event
	// window for withdrawal/refund truth to race.
	try {
		after(triggerDispatch)
	} catch (error) {
		// The invite and credit debit already committed in one database
		// transaction. A notification follow-up fault must not turn that durable
		// success into a retryable-looking failure.
		reportError(error, {
			action: "createInviteForCurrentHost.notification",
			userId,
		})
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

export type SeekerSearchActionResult =
	| { readonly ok: true; readonly seekers: readonly SeekerSearchResult[] }
	| { readonly ok: false; readonly error: HostDiscoveryActionError }

/**
 * Listing-scoped seeker search for the invite drawer. Input is validated before
 * auth, rate limiting, or database work so malformed scripted calls cannot
 * consume resources. Every failure stays distinguishable from a true empty
 * result and is safe for the client to render.
 */
export async function searchSeekersAction(
	listingId: unknown,
	query: unknown,
): Promise<SeekerSearchActionResult> {
	const input = normalizeSeekerSearchRequest(listingId, query)
	if (!input.ok) return input

	let actionUserId: string | undefined
	try {
		const { userId, getToken } = await auth()
		actionUserId = userId ?? undefined
		if (!userId) return { ok: false, error: "unauthenticated" }

		// This read exposes discovery-safe profile details, so cap enumeration.
		const { allowed } = await checkRateLimitDistributed(
			`seeker-search:${userId}`,
			30,
			60 * 60 * 1000,
		)
		if (!allowed) return { ok: false, error: "rate_limit_exceeded" }

		const token = await getToken()
		if (!token) return { ok: false, error: "unauthenticated" }

		const result = await searchSeekersForInvite(
			token,
			userId,
			input.listingId,
			input.query,
		)
		if (!result.ok) {
			return { ok: false, error: result.error satisfies HostDiscoveryError }
		}
		return { ok: true, seekers: result.seekers }
	} catch (error) {
		reportError(error, {
			action: "searchSeekersAction",
			userId: actionUserId,
		})
		return { ok: false, error: "temporarily_unavailable" }
	}
}
