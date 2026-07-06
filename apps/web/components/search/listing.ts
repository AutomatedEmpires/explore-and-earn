import type {
	BenefitKind,
	BenefitProvision,
	DiscoveryCardConditionalBadge,
	MarketplaceCategory,
} from "@explore-and-earn/contracts";

/**
 * Search lane domain model.
 *
 * This is intentionally NOT a shared contract: it is the Search lane's own view
 * model. It carries machine-readable benefit `provision` so the benefit filters
 * can run over structured data, before results are mapped to the canonical
 * DiscoveryCardData for rendering.
 */
export interface SearchBenefit {
	readonly provision: BenefitProvision;
	/** Human-readable summary surfaced in the DiscoveryCard triad. */
	readonly summary: string;
}

export type SearchBenefits = Readonly<Record<BenefitKind, SearchBenefit>>;

export interface SearchListing {
	readonly id: string;
	readonly title: string;
	readonly hostName: string;
	readonly category: MarketplaceCategory;
	readonly location: string;
	readonly opportunityWindow: string;
	readonly benefits: SearchBenefits;
	readonly verifiedHost?: boolean;
	readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[];
	/** 0–100 ADR-040 fit for the signed-in seeker; absent for anon/thin profiles. */
	readonly matchScore?: number;
}
