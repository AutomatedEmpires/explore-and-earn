/**
 * UI fixture view-models — Explore&Earn (lead-owned foundation).
 *
 * SCOPE (founder-approved 2026-06-02): display-only view-models for the
 * Discovery Card, Listing Detail, and Host Profile surfaces, so every feature
 * lane renders against ONE canonical shape instead of inventing its own mocks.
 *
 * This is NOT a persisted object model / DB schema / data-dictionary row. It
 * mirrors the canonical registries in @explore-and-earn/contracts and uses
 * human-readable display strings only — no money math, no persistence, no
 * routing. The gated data-dictionary build pack still owns the real object
 * model (see packages/contracts/src/card.ts).
 *
 * Imports are TYPE-ONLY so nothing from contracts ends up in the runtime bundle.
 */
import type {
	BenefitTriad,
	DiscoveryCardConditionalBadge,
	OpportunityCategory,
	OpportunityTriad,
	VerifiedHostQualifier,
} from "@explore-and-earn/contracts"

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
	/** The Verified-Host badge always carries the canonical qualifier (G22). */
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
	readonly category: OpportunityCategory
	/** Display strings for the mandatory Housing / Meals / Pay triad. */
	readonly triad: OpportunityTriad
	/** Conditional badges beyond the always-on category + Verified-Host badges. */
	readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[]
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
	/** Ids of other listings this host offers. */
	readonly listingIds: readonly string[]
}

/** Listing Detail view-model — the full listing surface. */
export interface ListingDetailViewModel {
	readonly card: DiscoveryCardViewModel
	readonly summary: string
	readonly description: readonly string[]
	readonly gallery: readonly FixturePhoto[]
	/** Richer triad with provision + summary for the detail surface. */
	readonly benefits: BenefitTriad
	readonly housingEvidence: readonly FixturePhoto[]
	readonly mealsEvidence: readonly FixturePhoto[]
	readonly host: HostProfileViewModel
}
