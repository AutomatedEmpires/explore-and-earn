/**
 * UI fixture view-models — Explore&Earn (lead-owned foundation).
 *
 * SCOPE (founder-approved 2026-06-02): display-only view-models for the
 * Discovery Card, Listing Detail, and Host Profile surfaces, so every feature
 * lane renders against ONE canonical shape instead of inventing its own mocks.
 *
 * This is NOT a persisted object model / DB schema / data-dictionary row. These
 * are presentation view-models with human-readable display strings only — no
 * money math, persistence, or routing. The real object model stays gated in the
 * data-dictionary build pack (see packages/contracts/src/card.ts).
 *
 * The unions below MIRROR the canonical registries in
 * @explore-and-earn/contracts (enums.ts MARKETPLACE_CATEGORIES, card.ts,
 * benefits.ts). They are intentionally redeclared locally so this fixtures
 * layer carries ZERO cross-package build coupling; unifying the import is a
 * separate, deliberate step once the apps/web -> contracts build path is
 * validated. Category drift is caught by the G031 taxonomy guardrail.
 */

/** Locked opportunity lanes — mirrors MARKETPLACE_CATEGORIES. */
export type FixtureCategory =
	| "farm"
	| "maritime"
	| "remote"
	| "seasonal"
	| "mix"

/** Whether / how a benefit is provided — mirrors BENEFIT_PROVISION. */
export type FixtureProvision = "provided" | "partial" | "not_provided"

/** Conditional card badges beyond the always-on category + Verified-Host. */
export type FixtureConditionalBadge = "seasonal" | "featured" | "boosted"

/** The Verified-Host badge always carries this exact qualifier (G22). */
export type VerifiedHostQualifier = "Self-Declared by Host"

/** Display strings for the mandatory Housing / Meals / Pay triad. */
export interface FixtureTriad {
	readonly housing: string
	readonly meals: string
	readonly pay: string
}

/** One benefit on the detail surface: provision + short display summary. */
export interface FixtureBenefit {
	readonly provision: FixtureProvision
	readonly summary: string
}

/** The richer triad shown on the listing detail surface. */
export interface FixtureBenefitTriad {
	readonly housing: FixtureBenefit
	readonly meals: FixtureBenefit
	readonly pay: FixtureBenefit
}

/** A photo rendered on a card or detail surface (display URL + alt only). */
export interface FixturePhoto {
	readonly url: string
	readonly alt: string
}

/** Minimal host reference shown on a Discovery Card. */
export interface HostSummaryViewModel {
	readonly id: string
	readonly name: string
	readonly avatar: FixturePhoto
	readonly verifiedQualifier: VerifiedHostQualifier
}

/**
 * Discovery Card view-model — one shape for every card surface. The field set
 * mirrors DISCOVERY_CARD_FIELDS; conditional fields are optional.
 */
export interface DiscoveryCardViewModel {
	readonly id: string
	readonly heroPhoto: FixturePhoto
	readonly host: HostSummaryViewModel
	readonly jobTitle: string
	readonly location: string
	/** Human-readable window, e.g. "May – Sep 2026". */
	readonly opportunityWindow: string
	readonly category: FixtureCategory
	readonly triad: FixtureTriad
	readonly conditionalBadges?: readonly FixtureConditionalBadge[]
	/** Present only on the "matched" surface (0–100). */
	readonly matchScore?: number
	/** Subtle, never-an-ad "boosted" treatment flag. */
	readonly boosted?: boolean
}

/** Host Profile view-model for the host detail surface. */
export interface HostProfileViewModel {
	readonly id: string
	readonly name: string
	readonly avatar: FixturePhoto
	readonly verifiedQualifier: VerifiedHostQualifier
	readonly tagline: string
	readonly bio: string
	readonly location: string
	readonly listingIds: readonly string[]
}

/** Listing Detail view-model — the full listing surface. */
export interface ListingDetailViewModel {
	readonly card: DiscoveryCardViewModel
	readonly summary: string
	readonly description: readonly string[]
	readonly gallery: readonly FixturePhoto[]
	readonly benefits: FixtureBenefitTriad
	readonly housingEvidence: readonly FixturePhoto[]
	readonly mealsEvidence: readonly FixturePhoto[]
	readonly host: HostProfileViewModel
}
