// Listing provenance — the honesty contract for where a listing came from and
// how much of it has been confirmed.
//
// CORE INVARIANT (founder charter 2026-07-14, provenance lane): every field a
// seeker sees is either (a) supplied by a verified host, (b) explicitly stated
// by an attributable public source, or (c) clearly marked NOT STATED. Nothing
// is inferred, embellished, estimated, or fabricated. "Not stated" is missing
// information — it is NEVER collapsed into "no".
//
// This file is the stable interface other fleet lanes build against (sourced
// badge, claim experience, ingestion, matching). Do not fork these semantics.

/* ------------------------------------------------------------- provenance */

/**
 * Where a listing's authority comes from.
 *
 * - `verified` — created or claimed-and-confirmed by a real authenticated host
 *   through the platform workflow. Eligible for host identity, the
 *   verified-host badge, reviews, and monetization behavior (where otherwise
 *   allowed).
 * - `sourced`  — derived from a real, attributable public posting or a
 *   founder-controlled feed. Surfaced by Explore & Earn but NOT confirmed by
 *   the employer; structurally barred from host identity, reviews, the
 *   verified badge, and monetization.
 */
export const LISTING_PROVENANCE = ["verified", "sourced"] as const
export type ListingProvenance = (typeof LISTING_PROVENANCE)[number]

/* -------------------------------------------------------- benefit evidence */

/**
 * Evidence status for a single listing fact (housing / meals / pay / dates …).
 *
 * - `not_stated` — the originating source did not state it. There is NO value;
 *   consumers must render "Not stated" and must never rank or reason over it
 *   as if it were a yes OR a no.
 * - `stated`    — an attributable public source explicitly stated the value.
 *   Real, but not employer-confirmed.
 * - `confirmed` — an authenticated employer supplied or confirmed the value
 *   through the platform workflow (all host-authored listing facts are
 *   `confirmed` by construction).
 */
export const BENEFIT_EVIDENCE_STATUS = [
	"not_stated",
	"stated",
	"confirmed",
] as const
export type BenefitEvidenceStatus = (typeof BENEFIT_EVIDENCE_STATUS)[number]

/** Per-triad-benefit evidence carried alongside the value columns. */
export interface BenefitEvidenceMap {
	readonly housing: BenefitEvidenceStatus
	readonly meals: BenefitEvidenceStatus
	readonly pay: BenefitEvidenceStatus
}

/** Every fact a host authored is confirmed by construction. */
export const HOST_CONFIRMED_EVIDENCE: BenefitEvidenceMap = {
	housing: "confirmed",
	meals: "confirmed",
	pay: "confirmed",
}

/* ------------------------------------------------------------ attribution */

/** Public attribution for a sourced listing — always preserved, never removed. */
export interface SourceAttribution {
	/** Human-readable source name (e.g. "CoolWorks", "USAJOBS feed"). */
	readonly sourceName: string
	/** Canonical URL of the original posting (outbound link target). */
	readonly sourceUrl: string | null
	/** The source's own posting identifier, where available. */
	readonly sourcePostingId: string | null
	/** When the source says it published the posting (ISO), where available. */
	readonly publishedAt: string | null
	/** When Explore & Earn last observed/imported the posting (ISO). */
	readonly retrievedAt: string | null
	/**
	 * Employer name AS STATED BY THE SOURCE. Display-only: this is not a host,
	 * has no profile, no reviews, and no verified badge.
	 */
	readonly employerName: string | null
}

/* ------------------------------------------------------------ claim status */

/**
 * Listing-level claim summary (the full state machine lives on the claim
 * entity — see LISTING_CLAIM_STATUS). `not_applicable` for verified-native
 * listings; sourced listings start `unclaimed`.
 */
export const LISTING_CLAIM_SUMMARY = [
	"not_applicable",
	"unclaimed",
	"claim_pending",
	"converted",
] as const
export type ListingClaimSummary = (typeof LISTING_CLAIM_SUMMARY)[number]

/**
 * The employer claim-to-verify state machine (server-enforced; transitions in
 * LISTING_CLAIM_TRANSITIONS).
 *
 * initiated             — an authenticated user started a claim.
 * verification_pending  — identity/authority verification is underway.
 * requires_review       — founder/admin review required before approval.
 * approved              — authority accepted; employer may confirm the listing.
 * confirming            — employer is reviewing/editing sourced fields.
 * converted             — listing converted sourced → verified (terminal-ish).
 * rejected              — claim denied (terminal).
 * revoked               — approval/conversion revoked or disputed (terminal).
 */
export const LISTING_CLAIM_STATUS = [
	"initiated",
	"verification_pending",
	"requires_review",
	"approved",
	"confirming",
	"converted",
	"rejected",
	"revoked",
] as const
export type ListingClaimStatus = (typeof LISTING_CLAIM_STATUS)[number]

/** Claim states that block a competing claim on the same listing. */
export const ACTIVE_CLAIM_STATUSES: readonly ListingClaimStatus[] = [
	"initiated",
	"verification_pending",
	"requires_review",
	"approved",
	"confirming",
]

/**
 * Legal transitions (same TransitionMap convention as contracts/lifecycles.ts).
 * Anything absent is an invalid transition and must be rejected server-side.
 */
export const LISTING_CLAIM_TRANSITIONS: Readonly<
	Record<ListingClaimStatus, readonly ListingClaimStatus[]>
> = {
	initiated: ["verification_pending", "requires_review", "rejected"],
	verification_pending: ["requires_review", "approved", "rejected"],
	requires_review: ["approved", "rejected"],
	approved: ["confirming", "revoked", "rejected"],
	confirming: ["converted", "revoked"],
	converted: ["revoked"],
	rejected: [],
	revoked: [],
}

export function canTransitionClaim(
	from: ListingClaimStatus,
	to: ListingClaimStatus,
): boolean {
	return (LISTING_CLAIM_TRANSITIONS[from] ?? []).includes(to)
}

/* ------------------------------------------------------- listing-level view */

/**
 * Provenance block carried on the canonical listing view-model. OPTIONAL and
 * additive: absent means a legacy verified listing (pre-provenance rows and
 * fixtures behave exactly as before).
 */
export interface ListingProvenanceInfo {
	readonly provenance: ListingProvenance
	/** Present iff provenance === 'sourced' (attribution never renders for verified-native). */
	readonly source?: SourceAttribution
	readonly claimStatus: ListingClaimSummary
	/** Per-benefit evidence; HOST_CONFIRMED_EVIDENCE for verified listings. */
	readonly benefitEvidence: BenefitEvidenceMap
}

/** Type guard: is this listing sourced (unconfirmed) inventory? */
export function isSourcedListing(
	info: Pick<ListingProvenanceInfo, "provenance"> | null | undefined,
): boolean {
	return info?.provenance === "sourced"
}

/* -------------------------------------------------------------- freshness */

/**
 * Sourced-inventory freshness. Derived (never stored) from the source
 * timestamps; verified listings are always `not_applicable` — a verified
 * listing is the host's own and never goes stale because a source vanished.
 */
export const SOURCED_FRESHNESS = [
	"fresh",
	"aging",
	"stale",
	"not_applicable",
] as const
export type SourcedFreshness = (typeof SOURCED_FRESHNESS)[number]

/** Days since last observation before a sourced listing is 'aging' / 'stale'. */
export const SOURCED_AGING_DAYS = 21
export const SOURCED_STALE_DAYS = 45

/**
 * Pure freshness derivation. `lastSeenAt` is the newest of retrieval /
 * publication; missing timestamps degrade conservatively to 'stale' (an
 * unobservable posting must not present as current).
 */
export function sourcedFreshness(args: {
	readonly provenance: ListingProvenance
	readonly retrievedAt: string | null
	readonly publishedAt: string | null
	readonly nowMs: number
}): SourcedFreshness {
	if (args.provenance !== "sourced") return "not_applicable"
	const seen = [args.retrievedAt, args.publishedAt]
		.map((v) => (v ? Date.parse(v) : Number.NaN))
		.filter((ms) => Number.isFinite(ms))
	if (seen.length === 0) return "stale"
	const ageDays = (args.nowMs - Math.max(...seen)) / 86_400_000
	if (ageDays >= SOURCED_STALE_DAYS) return "stale"
	if (ageDays >= SOURCED_AGING_DAYS) return "aging"
	return "fresh"
}

/* ------------------------------------------------------------ display copy */

/**
 * The canonical seeker-facing sourced disclosure. Rendered wherever a sourced
 * listing appears; do not soften, truncate, or restyle the meaning.
 */
export const SOURCED_DISCLOSURE_LABEL = "Sourced · not yet confirmed by Explore & Earn"

/** The canonical "no information" display for a not_stated benefit. */
export const NOT_STATED_LABEL = "Not stated"
