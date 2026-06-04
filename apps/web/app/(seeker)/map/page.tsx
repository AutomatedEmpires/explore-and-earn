import type { Metadata } from "next";

import { BucketPage, OpportunityMap } from "../../../components/seeker";
import { getDiscoveryListings } from "../../../components/discovery";

export const metadata: Metadata = {
	title: "Map",
};

/**
 * Map \u2014 locked seeker-nav tab. Sprint Zero ships a location-grouped
 * opportunity index (no map library in the frozen deps); a real tile/vector map
 * swaps in behind OpportunityMap when the geocoded data layer lands. Listings
 * now arrive through the discovery data-access boundary (getDiscoveryListings).
 */
export default async function MapPage() {
	const listings = await getDiscoveryListings();
	return (
		<BucketPage
			title="Map"
			description="Explore open opportunities by location."
		>
			<OpportunityMap listings={listings} />
		</BucketPage>
	);
}
