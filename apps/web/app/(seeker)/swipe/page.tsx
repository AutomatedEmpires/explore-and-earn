import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSavedListingIds } from "@explore-and-earn/db";

import { type DiscoveryListing } from "../../../components/discovery";
import {
	getDiscoveryListings,
	getSwipeListings,
} from "../../../components/discovery/data";
import { BucketPage, SwipeDeck } from "../../../components/seeker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Swipe",
};

/**
 * Swipe \u2014 locked seeker-nav tab (Swipe \u00b7 Map \u00b7 Seek \u00b7 Profile).
 *
 * Fetches the first swipe batch for the authenticated seeker: the newest live
 * listings, excluding anything they have already saved or applied to (the
 * applied filter is enforced server-side inside getSwipeBatch). The deck then
 * paginates client-side via getSwipeBatchAction. AUTH LAW: userId comes from
 * auth().userId and the Supabase token from getToken().
 * An unauthenticated/edge render falls back to the public feed so the deck is
 * never empty.
 */
export default async function SwipePage() {
	const { userId, getToken } = await auth();

	let listings: DiscoveryListing[] = [];
	let initialCursor: string | null = null;
	// True once a personalized batch was fetched successfully — even if empty,
	// so a signed-in seeker who has swiped through everything keeps their honest
	// "all caught up" state instead of being shown the public feed.
	let personalizedOk = false;

	if (userId) {
		const token = await getToken();
		if (token) {
			// A fault in the personalized swipe batch (transient DB error, or the
			// dev bench's sentinel token locally) must not dead-end a locked
			// discovery mode — fall through to the public feed instead.
			try {
				const savedIds = await getSavedListingIds(token, userId);
				const batch = await getSwipeListings(token, userId, savedIds);
				listings = batch.listings;
				initialCursor = batch.nextCursor;
				personalizedOk = true;
			} catch {
				personalizedOk = false;
			}
		}
	}

	if (listings.length === 0 && !personalizedOk) {
		listings = await getDiscoveryListings();
	}

	return (
		<BucketPage
			title="Swipe"
			description="Drag through opportunities — pass, save, or apply. Use the buttons or arrow keys."
		>
			<SwipeDeck listings={listings} initialCursor={initialCursor} isAuthenticated={!!userId} />
		</BucketPage>
	);
}
