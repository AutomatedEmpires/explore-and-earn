import { BucketPage } from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";

/**
 * Swipe — locked seeker-nav tab. Placeholder surface until the Phase D swipe
 * deck lands; ships now so the founder-locked bottom nav has no dead tab.
 */
export default function SwipePage() {
	return (
		<BucketPage
			title="Swipe"
			description="Swipe through matched opportunities one at a time."
		>
			<EmptyState
				title="Swipe is coming soon"
				message="The discovery deck is in active development. Check back shortly."
			/>
		</BucketPage>
	);
}
