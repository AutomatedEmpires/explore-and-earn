import type { BenefitProvision } from "@explore-and-earn/contracts";

import { DISCOVERY_FIXTURES } from "../discovery/fixtures";
import type { SearchBenefit, SearchListing } from "./listing";

const PROVISION_LABEL: Readonly<Record<BenefitProvision, string>> = {
	provided: "Provided",
	partial: "Partially provided",
	not_provided: "Not included",
};

function toSearchBenefit(benefit: {
	readonly provision: BenefitProvision;
	readonly summary?: string;
}): SearchBenefit {
	return {
		provision: benefit.provision,
		summary: benefit.summary ?? PROVISION_LABEL[benefit.provision],
	};
}

/**
 * Search uses the canonical discovery fixtures so every result ID resolves in
 * listing detail, Map, Seek, and Swipe. The route keeps its narrow view-model,
 * but fixture content has one source of truth.
 */
export const SEARCH_FIXTURES: readonly SearchListing[] = DISCOVERY_FIXTURES.map(
	(listing) => ({
		id: listing.id,
		title: listing.title,
		hostName: listing.host.name,
		category: listing.category,
		location: listing.location,
		hasCoordinates: Boolean(listing.coordinates),
		opportunityWindow: listing.opportunityWindow,
		coverImageUrl: listing.coverImageUrl,
		payInsight: listing.payInsight,
		benefits: {
			housing: toSearchBenefit(listing.benefits.housing),
			meals: toSearchBenefit(listing.benefits.meals),
			pay: toSearchBenefit(listing.benefits.pay),
		},
		verifiedHost: listing.host.verified,
		conditionalBadges: listing.conditionalBadges,
	}),
);
