import type { Metadata } from "next";

import { BucketPage, OpportunityMap } from "../../../components/seeker";
import { getDiscoveryListings } from "../../../components/discovery";

export const metadata: Metadata = {
	title: "Map",
};

type MapSearchParams = {
	[key: string]: string | string[] | undefined;
};

function firstValue(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * Map \u2014 locked seeker-nav tab. Sprint Zero ships a location-grouped
 * opportunity index (no map library in the frozen deps); a real tile/vector map
 * swaps in behind OpportunityMap when the geocoded data layer lands. Listings
 * now arrive through the discovery data-access boundary (getDiscoveryListings).
 * A ?focus=<id> deep link (from a card's location row on another surface)
 * auto-opens that listing's peek.
 */
export default async function MapPage({
	searchParams,
}: {
	searchParams: Promise<MapSearchParams>;
}) {
	const [params, listings] = await Promise.all([
		searchParams,
		getDiscoveryListings(),
	]);
	return (
		<BucketPage
			title="Map"
			description="Explore open opportunities by location."
		>
			<OpportunityMap
				listings={listings}
				initialFocusId={firstValue(params.focus)}
			/>
		</BucketPage>
	);
}
