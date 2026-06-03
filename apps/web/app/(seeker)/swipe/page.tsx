import { BucketPage, MATCHED_LISTINGS, SwipeDeck } from "../../../components/seeker";

/**
 * Swipe — locked seeker-nav tab (Swipe · Map · Seek · Profile).
 *
 * Phase D: replaces the placeholder shipped with the locked bottom nav. Steps
 * through matched opportunities one at a time via the canonical DiscoveryCard
 * ("swipe" surface). UI-only — no backend or matching algorithm yet.
 */
export default function SwipePage() {
	return (
		<BucketPage
			title="Swipe"
			description="Review matched opportunities one at a time — pass, save, or apply."
		>
			<SwipeDeck listings={MATCHED_LISTINGS} />
		</BucketPage>
	);
}
