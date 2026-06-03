import { BucketPage, OpportunityMap } from "../../../components/seeker";
import { DISCOVERY_FIXTURES } from "../../../components/discovery";

/**
 * Map — locked seeker-nav tab. Sprint Zero ships a location-grouped opportunity
 * index (no map library in the frozen deps); a real tile/vector map swaps in
 * behind OpportunityMap when the geocoded data layer lands.
 */
export default function MapPage() {
	return (
		<BucketPage
			title="Map"
			description="Explore open opportunities by location."
		>
			<OpportunityMap listings={DISCOVERY_FIXTURES} />
		</BucketPage>
	);
}
