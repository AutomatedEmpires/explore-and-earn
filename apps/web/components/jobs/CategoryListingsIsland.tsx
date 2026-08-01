"use client";

import { useRouter } from "next/navigation";

import { ListingCardGrid } from "../discovery/ListingCard";
import type { DiscoveryListing } from "../discovery";
import { EmptyState } from "../discovery/EmptyState";
import { CATEGORY_LANDING, type LandingCategory } from "../../lib/categoryLanding";

/**
 * Client island for the /jobs/{lane} landing pages: the canonical responsive
 * listing grid + shared popup host (Quick Peek, host profile, benefit trust)
 * around server-fetched, monetization-ranked listings. The empty state keeps
 * the honest publish-gate register and deliberately carries NO lane
 * suggestions — the page's own "Scout a different lane" nav renders directly
 * below it, and repeating the four links here doubled them on the live face.
 */
export function CategoryListingsIsland({
	category,
	listings,
	readFailed = false,
}: {
	readonly category: LandingCategory;
	readonly listings: readonly DiscoveryListing[];
	/** The lane read faulted — never dressed up as an empty lane. */
	readonly readFailed?: boolean;
}) {
	const router = useRouter();

	return (
		<ListingCardGrid
			listings={listings as DiscoveryListing[]}
			surface="discovery_feed"
			overrides={{ onApply: (id) => router.push(`/listing/${id}`) }}
			eagerCount={3}
			emptyState={
				readFailed ? (
					<EmptyState
						title="This lane couldn't be read"
						message="Something between us and the listings failed just now. Nothing is gone — refresh in a moment and this page will try again."
						icon={`category.${category}`}
						actionLabel="Try again"
						actionHref={`/jobs/${category}`}
					/>
				) : (
					/* Same correction as the homepage empty state: "is being staffed" /
					   "Hosts are onboarding now" assert activity nothing here can
					   evidence, and this renders whenever the lane is empty. */
					<EmptyState
						title={`No ${CATEGORY_LANDING[category].label.toLowerCase()} roles listed yet.`}
						message="We only publish opportunities that answer housing, meals and pay upfront. Try another lane in the meantime."
						icon={`category.${category}`}
						actionLabel="Explore the marketplace"
						actionHref="/seek"
					/>
				)
			}
		/>
	);
}
