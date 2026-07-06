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
 * auth().userId and the Supabase token from getToken({ template: "supabase" }).
 * An unauthenticated/edge render falls back to the public feed so the deck is
 * never empty.
 */
export default async function SwipePage() {
	const { userId, getToken } = await auth();

	let listings: DiscoveryListing[] = [];
	let initialCursor: string | null = null;

	if (userId) {
		const token = await getToken({ template: "supabase" });
		if (token) {
			const savedIds = await getSavedListingIds(token, userId);
			const batch = await getSwipeListings(token, userId, savedIds);
			listings = batch.listings;
			initialCursor = batch.nextCursor;
		}
	}

	if (listings.length === 0 && !userId) {
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
