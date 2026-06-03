import { BucketPage } from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";

/**
 * Map — locked seeker-nav tab. Placeholder surface until the Phase D map view
 * lands; ships now so the founder-locked bottom nav has no dead tab.
 */
export default function MapPage() {
	return (
		<BucketPage
			title="Map"
			description="Explore open opportunities by location."
		>
			<EmptyState
				title="Map is coming soon"
				message="The opportunity map is in active development. Check back shortly."
			/>
		</BucketPage>
	);
}
