"use client";

import { useRouter } from "next/navigation";

import { ListingCardGrid } from "../discovery/ListingCard";
import type { DiscoveryListing } from "../discovery";
import { EmptyState } from "../discovery/EmptyState";
import {
	CATEGORY_LANDING,
	LANDING_CATEGORIES,
	categoryLandingPath,
	type LandingCategory,
} from "../../lib/categoryLanding";

/**
 * Client island for the /jobs/{lane} landing pages: the canonical responsive
 * listing grid + shared popup host (Quick Peek, host profile, benefit trust)
 * around server-fetched, monetization-ranked listings. Empty lanes recover via
 * the honest founding-season register — cross-links, never fabricated counts.
 */
export function CategoryListingsIsland({
	category,
	listings,
}: {
	readonly category: LandingCategory;
	readonly listings: readonly DiscoveryListing[];
}) {
	const router = useRouter();

	const suggestions = [
		...LANDING_CATEGORIES.filter((lane) => lane !== category).map((lane) => ({
			label: CATEGORY_LANDING[lane].label,
			href: categoryLandingPath(lane),
			icon: `category.${lane}` as const,
		})),
		{ label: "All work", href: "/seek", icon: "nav.seek" as const },
	];

	return (
		<ListingCardGrid
			listings={listings as DiscoveryListing[]}
			surface="discovery_feed"
			overrides={{ onApply: (id) => router.push(`/listing/${id}`) }}
			eagerCount={3}
			emptyState={
				<EmptyState
					title={`The first ${CATEGORY_LANDING[category].label.toLowerCase()} season is being staffed.`}
					message="Hosts are onboarding now. Be first in line when roles open — or scout another lane."
					icon={`category.${category}`}
					suggestions={suggestions}
					actionLabel="Explore the marketplace"
					actionHref="/seek"
				/>
			}
		/>
	);
}
