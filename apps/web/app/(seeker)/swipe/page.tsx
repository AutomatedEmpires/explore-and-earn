import { DISCOVERY_FIXTURES } from "../../../components/discovery";
import { BucketPage, SwipeDeck } from "../../../components/seeker";

/**
 * Swipe — locked seeker-nav tab (Swipe · Map · Seek · Profile).
 *
 * Phase D: a true swipe experience over the canonical DiscoveryCard — drag,
 * keyboard, undo, peeking card stack, and a neutral match Meter. UI-only; no
 * backend or matching algorithm yet.
 */
export default function SwipePage() {
	return (
		<BucketPage
			title="Swipe"
			description="Drag through opportunities — pass, save, or apply. Use the buttons or arrow keys."
		>
			<SwipeDeck listings={DISCOVERY_FIXTURES} />
		</BucketPage>
	);
}
