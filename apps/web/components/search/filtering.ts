import type { BenefitKind, MarketplaceCategory } from "@explore-and-earn/contracts";
import type { DiscoveryCardData } from "@explore-and-earn/ui";

import type { SearchListing } from "./listing";

export interface SearchFilters {
	readonly query: string;
	readonly categories: readonly MarketplaceCategory[];
	readonly benefits: readonly BenefitKind[];
}

export const EMPTY_FILTERS: SearchFilters = {
	query: "",
	categories: [],
	benefits: [],
};

/**
 * Pure filter over the Search domain model.
 *
 * - query: case-insensitive substring match across title, host, and location.
 * - categories: empty means all lanes; otherwise the listing's lane must be selected.
 * - benefits: AND semantics — every selected benefit must be at least partially
 *   provided (`provision !== "not_provided"`), so partial provision still counts.
 */
export function filterListings(
	listings: readonly SearchListing[],
	filters: SearchFilters,
): readonly SearchListing[] {
	const query = filters.query.trim().toLowerCase();

	return listings.filter((listing) => {
		if (query.length > 0) {
			const haystack =
				`${listing.title} ${listing.hostName} ${listing.location}`.toLowerCase();
			if (!haystack.includes(query)) {
				return false;
			}
		}

		if (
			filters.categories.length > 0 &&
			!filters.categories.includes(listing.category)
		) {
			return false;
		}

		if (filters.benefits.length > 0) {
			const everyBenefitPresent = filters.benefits.every(
				(kind) => listing.benefits[kind].provision !== "not_provided",
			);
			if (!everyBenefitPresent) {
				return false;
			}
		}

		return true;
	});
}

/** Map a Search domain listing onto the canonical DiscoveryCardData shape. */
export function toDiscoveryCardData(listing: SearchListing): DiscoveryCardData {
	return {
		id: listing.id,
		title: listing.title,
		hostName: listing.hostName,
		category: listing.category,
		location: listing.location,
		opportunityWindow: listing.opportunityWindow,
		coverImageUrl: listing.coverImageUrl,
		triad: {
			housing: listing.benefits.housing.summary,
			meals: listing.benefits.meals.summary,
			pay: listing.benefits.pay.summary,
		},
		benefitProvision: {
			housing: listing.benefits.housing.provision,
			meals: listing.benefits.meals.provision,
			pay: listing.benefits.pay.provision,
		},
		verifiedHost: listing.verifiedHost,
		conditionalBadges: listing.conditionalBadges,
		matchScore: listing.matchScore,
	};
}
