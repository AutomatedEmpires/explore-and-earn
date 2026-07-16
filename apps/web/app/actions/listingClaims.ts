"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import {
	adminClaimContext,
	beginClaimConfirmation,
	confirmAndConvertClaim,
	getClaimableListing,
	getClaimsAwaitingReview,
	getMyListingClaims,
	initiateListingClaim,
	recordEvent,
	transitionListingClaim,
	type AuthorityEvidence,
	type ClaimConfirmedFields,
	type ListingClaimRecord,
} from "@explore-and-earn/db"

import { isCurrentUserAdmin } from "../../lib/admin"
import { checkRateLimit } from "../../lib/rateLimit"
import { reportError } from "../../lib/sentry"

/**
 * Employer claim-to-verify server actions.
 *
 * AUTH LAW: userId always comes from auth().userId. Ownership/authority is
 * enforced server-side at every step (claimant checks inside the db layer +
 * the SQL functions' own guards); status transitions run ONLY through the
 * atomic transition/conversion functions — no client can write provenance,
 * claim status, or evidence columns directly.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validAuthority(input: unknown): AuthorityEvidence | null {
	if (!input || typeof input !== "object") return null
	const raw = input as Record<string, unknown>
	const workEmail = typeof raw.workEmail === "string" ? raw.workEmail.trim() : ""
	const roleTitle = typeof raw.roleTitle === "string" ? raw.roleTitle.trim() : ""
	const statement = typeof raw.statement === "string" ? raw.statement.trim() : ""
	if (!EMAIL_RE.test(workEmail) || workEmail.length > 200) return null
	if (roleTitle.length === 0 || roleTitle.length > 120) return null
	if (statement.length < 10 || statement.length > 2000) return null
	return { workEmail, roleTitle, statement }
}

/**
 * Step 1-3 of the claim flow: an authenticated user asserts authority over a
 * sourced listing. Lands in founder review (no self-service approval path).
 */
export async function initiateClaimAction(
	listingId: string,
	authority: { workEmail: string; roleTitle: string; statement: string },
): Promise<{ ok: boolean; claimId?: string; error?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }

		const { allowed } = checkRateLimit(`claim:${userId}`, 5, 60 * 60 * 1000)
		if (!allowed) return { ok: false, error: "rate_limit_exceeded" }

		const evidence = validAuthority(authority)
		if (!evidence) return { ok: false, error: "invalid_authority_evidence" }

		const result = await initiateListingClaim(userId, listingId, evidence)
		if (result.ok) {
			await recordEvent({
				eventType: "listing_claim_initiated",
				actorScope: "host",
				subjectType: "listing_claim",
				subjectId: result.claimId,
				listingId,
			})
		}
		return result
	} catch (error) {
		reportError(error, { action: "initiateClaimAction" })
		return { ok: false, error: "claim_failed" }
	}
}

/** The caller's own claims (status surface). */
export async function getMyClaimsAction(): Promise<ListingClaimRecord[]> {
	try {
		const { userId, getToken } = await auth()
		if (!userId) return []
		const token = await getToken()
		if (!token) return []
		return await getMyListingClaims(token, userId)
	} catch (error) {
		reportError(error, { action: "getMyClaimsAction" })
		return []
	}
}

/** Claim-page context for a sourced listing (public summary + own claim). */
export async function getClaimContextAction(listingId: string): Promise<{
	listing: Awaited<ReturnType<typeof getClaimableListing>>
	myClaim: ListingClaimRecord | null
}> {
	try {
		const [listing, mine] = await Promise.all([
			getClaimableListing(listingId),
			getMyClaimsAction(),
		])
		return {
			listing,
			myClaim: mine.find((claim) => claim.listingId === listingId) ?? null,
		}
	} catch (error) {
		reportError(error, { action: "getClaimContextAction" })
		return { listing: null, myClaim: null }
	}
}

/**
 * Step 7: the APPROVED claimant attaches their host profile (created through
 * the normal host onboarding if they don't have one) and enters confirmation.
 */
export async function beginClaimConfirmationAction(
	claimId: string,
): Promise<{ ok: boolean; error?: string; hostProfileId?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		return await beginClaimConfirmation(userId, claimId)
	} catch (error) {
		reportError(error, { action: "beginClaimConfirmationAction" })
		return { ok: false, error: "confirmation_failed" }
	}
}

const CONFIRM_TEXT_LIMITS: ReadonlyArray<[keyof ClaimConfirmedFields, number]> = [
	["title", 200],
	["description", 10_000],
	["locationDisplay", 200],
	["housingDescription", 2000],
	["mealsDescription", 2000],
	["compensationSummary", 200],
	["compensationUnit", 20],
	["beginsAt", 40],
	["endsAt", 40],
]

function sanitizeConfirmed(input: unknown): ClaimConfirmedFields | null {
	if (!input || typeof input !== "object") return null
	const raw = input as Record<string, unknown>
	const out: Record<string, unknown> = {}
	for (const [key, max] of CONFIRM_TEXT_LIMITS) {
		const value = raw[key]
		if (value === undefined) continue
		if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
			return null
		}
		out[key] = value.trim()
	}
	for (const key of ["housingIncluded", "mealsIncluded"] as const) {
		if (raw[key] === undefined) continue
		if (typeof raw[key] !== "boolean") return null
		out[key] = raw[key]
	}
	for (const key of ["compensationMinCents", "compensationMaxCents"] as const) {
		const value = raw[key]
		if (value === undefined) continue
		if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100_000_000) {
			return null
		}
		out[key] = value
	}
	return out as ClaimConfirmedFields
}

/**
 * Steps 8-10: explicit final confirmation → atomic sourced→verified
 * conversion (lineage preserved). The employer has reviewed every sourced
 * field; anything they didn't edit is accepted as-is and marked confirmed.
 */
export async function confirmClaimListingAction(
	claimId: string,
	hostProfileId: string,
	confirmedFields: ClaimConfirmedFields,
): Promise<{ ok: boolean; error?: string; listingId?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }

		const confirmed = sanitizeConfirmed(confirmedFields)
		if (confirmed === null) return { ok: false, error: "invalid_confirmed_fields" }

		const result = await confirmAndConvertClaim(userId, claimId, hostProfileId, confirmed)
		if (result.ok && result.listingId) {
			await recordEvent({
				eventType: "listing_claim_converted",
				actorScope: "host",
				subjectType: "listing_claim",
				subjectId: claimId,
				listingId: result.listingId,
				hostProfileId,
			})
			revalidatePath(`/listing/${result.listingId}`)
			revalidatePath("/host/listings")
		}
		return result
	} catch (error) {
		reportError(error, { action: "confirmClaimListingAction" })
		return { ok: false, error: "conversion_failed" }
	}
}

/* ── Admin review ──────────────────────────────────────────────────────── */

export async function getClaimReviewQueueAction() {
	try {
		const { userId } = await auth()
		if (!userId || !(await isCurrentUserAdmin())) return []
		return await getClaimsAwaitingReview()
	} catch (error) {
		reportError(error, { action: "getClaimReviewQueueAction" })
		return []
	}
}

/**
 * Founder decision on a claim. The SQL function additionally enforces the
 * self-approval guard (approver must differ from the claimant) and legal
 * transitions — this gate is defense-in-depth, not the only wall.
 */
export async function reviewClaimAction(
	claimId: string,
	decision: "approved" | "rejected",
	notes?: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		if (!(await isCurrentUserAdmin())) return { ok: false, error: "forbidden" }

		const result = await transitionListingClaim(claimId, decision, userId, notes)
		if (result.ok) {
			// Anchor the event to the claimed listing so the notification taxonomy
			// (and analytics rollups) can resolve context without guessing. The
			// claimant's identity is looked up server-side downstream — clerk ids
			// never ride in event properties (events.ts privacy law).
			const claim = await adminClaimContext(claimId).catch(() => null)
			await recordEvent({
				eventType: decision === "approved" ? "listing_claim_approved" : "listing_claim_rejected",
				actorScope: "admin",
				subjectType: "listing_claim",
				subjectId: claimId,
				...(claim ? { listingId: claim.listingId } : {}),
			})
			revalidatePath("/admin/claims")
		}
		return result
	} catch (error) {
		reportError(error, { action: "reviewClaimAction" })
		return { ok: false, error: "review_failed" }
	}
}

/**
 * Fraud response: revoke a CONVERTED (or approved) claim. The SQL function
 * restores the exact pre-conversion sourced snapshot and detaches the host —
 * this action only gates and triggers it. No event is recorded: there is no
 * seeded listing_claim_revoked event type yet (adding one is a migration, out
 * of this slice), and recording a mislabeled type would be dishonest.
 */
export async function revokeClaimAction(
	claimId: string,
	notes?: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		if (!(await isCurrentUserAdmin())) return { ok: false, error: "forbidden" }

		const result = await transitionListingClaim(claimId, "revoked", userId, notes)
		if (result.ok) {
			revalidatePath("/admin/claims")
			// The listing may have just reverted verified → sourced.
			const claim = await adminClaimContext(claimId).catch(() => null)
			if (claim) {
				revalidatePath(`/listing/${claim.listingId}`)
				revalidatePath("/host/listings")
			}
		}
		return result
	} catch (error) {
		reportError(error, { action: "revokeClaimAction" })
		return { ok: false, error: "revoke_failed" }
	}
}
