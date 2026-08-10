"use server"

import { auth } from "@clerk/nextjs/server"
import {
	getHostProfile,
	getInviteEntitlement,
	getMatchedSeekersForListing,
	type InviteEntitlementSummary,
	type SourcedSeeker,
} from "@explore-and-earn/db"

import {
	createInviteCreditCheckoutSession,
	hasStripeCheckoutConfig,
	isInvitePackSize,
} from "../../services/stripe"
import { checkRateLimitDistributed } from "../../lib/rateLimit"
import { reportError } from "../../lib/sentry"
import {
	isValidOutreachListingId,
	type HostDiscoveryActionError,
} from "../../lib/hostOutreach"

/**
 * Host sourcing + invite-entitlement server actions.
 *
 * AUTH LAW: userId always comes from auth().userId (never decoded from a
 * token). Ownership of the listing is enforced inside
 * getMatchedSeekersForListing; entitlement math is server-resolved from the
 * host's real subscription tier. Nothing here trusts a client-supplied
 * identity, tier, or allowance.
 */

/** Best-effort current Clerk user id for error attribution (catch paths only). */
async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined
	} catch {
		return undefined
	}
}

export type MatchedSeekersActionResult =
	| {
			readonly ok: true
			readonly listingId: string
			readonly seekers: readonly SourcedSeeker[]
	  }
	| { readonly ok: false; readonly error: HostDiscoveryActionError }

/** Ranked matched seekers for one eligible listing the caller owns. */
export async function getMatchedSeekersAction(
	listingId: unknown,
	limit: unknown = 20,
): Promise<MatchedSeekersActionResult> {
	if (
		!isValidOutreachListingId(listingId) ||
		!Number.isInteger(limit) ||
		(limit as number) < 1 ||
		(limit as number) > 50
	) {
		return { ok: false, error: "invalid_request" }
	}

	let actionUserId: string | undefined
	try {
		const { userId, getToken } = await auth()
		actionUserId = userId ?? undefined
		if (!userId) return { ok: false, error: "unauthenticated" }
		const { allowed } = await checkRateLimitDistributed(`sourcing:${userId}`, 60, 5 * 60 * 1000)
		if (!allowed) return { ok: false, error: "rate_limit_exceeded" }
		const token = await getToken()
		if (!token) return { ok: false, error: "unauthenticated" }
		return await getMatchedSeekersForListing(token, userId, listingId, limit as number)
	} catch (error) {
		reportError(error, {
			action: "getMatchedSeekersAction",
			userId: actionUserId,
		})
		return { ok: false, error: "temporarily_unavailable" }
	}
}

/**
 * The authed host's invite entitlement (monthly allowance from their real
 * tier + purchased balance + current usage). Null when signed out or not a
 * host. `ledgerAvailable: false` means migration 061 is not applied yet —
 * surfaces must not render usage/upsell states off an unavailable ledger.
 */
export async function getInviteEntitlementAction(): Promise<InviteEntitlementSummary | null> {
	try {
		const { userId, getToken } = await auth()
		if (!userId) return null
		const token = await getToken()
		if (!token) return null
		return await getInviteEntitlement(token, userId)
	} catch (error) {
		reportError(error, {
			action: "getInviteEntitlementAction",
			userId: await currentUserId(),
		})
		return null
	}
}

/**
 * Start checkout for a founder-locked invite-credit pack (5/10/25 — ADR-028).
 * Returns the Stripe-hosted checkout URL; the webhook lands the credits
 * idempotently. Pack size is validated against the locked contract — an
 * arbitrary size or price can never be purchased.
 */
export async function purchaseInviteCreditsAction(
	credits: number,
): Promise<{ ok: boolean; url?: string; error?: string }> {
	try {
		const { userId, getToken } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }

		if (!Number.isInteger(credits) || !isInvitePackSize(credits)) {
			return { ok: false, error: "invalid_pack_size" }
		}

		if (!hasStripeCheckoutConfig()) {
			return { ok: false, error: "billing_unavailable" }
		}

		const { allowed } = await checkRateLimitDistributed(`invite-pack:${userId}`, 5, 10 * 60 * 1000)
		if (!allowed) return { ok: false, error: "rate_limit_exceeded" }

		const token = await getToken()
		if (!token) return { ok: false, error: "unauthenticated" }

		const hostProfile = await getHostProfile(token, userId)
		if (!hostProfile) return { ok: false, error: "profile_not_found" }

		const session = await createInviteCreditCheckoutSession({
			clerkUserId: userId,
			hostProfileId: hostProfile.id,
			credits,
		})

		return session.url
			? { ok: true, url: session.url }
			: { ok: false, error: "checkout_unavailable" }
	} catch (error) {
		reportError(error, {
			action: "purchaseInviteCreditsAction",
			userId: await currentUserId(),
		})
		return { ok: false, error: "checkout_failed" }
	}
}
