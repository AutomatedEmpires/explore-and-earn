import type { Metadata } from "next";

import { getDiscoveryListings } from "../../../components/discovery";
import { BucketPage, SwipeDeck } from "../../../components/seeker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Swipe",
};

/**
 * Swipe \u2014 locked seeker-nav tab (Swipe \u00b7 Map \u00b7 Seek \u00b7 Profile).
 *
 * Phase D: a true swipe experience over the canonical DiscoveryCard \u2014 drag,
 * keyboard, undo, peeking card stack, and a neutral match Meter. Listings now
 * arrive through the discovery data-access boundary (getDiscoveryListings); the
 * matching algorithm is still founder-gated backend work.
 */
export default async function SwipePage() {
	const listings = await getDiscoveryListings();
	return (
		<BucketPage
			title="Swipe"
			description="Drag through opportunities \u2014 pass, save, or apply. Use the buttons or arrow keys."
		>
			<SwipeDeck listings={listings} />
		</BucketPage>
	);
}
