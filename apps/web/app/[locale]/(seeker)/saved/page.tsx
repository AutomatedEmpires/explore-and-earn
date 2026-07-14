import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import {
	getPublicListingsByIds,
	getSavedListingIds,
	rowToDiscoveryFields,
} from "@explore-and-earn/db";

import { EmptyState, type DiscoveryListing } from "../../../../components/discovery";
import { BucketPage, SavedCardGrid } from "../../../../components/seeker";

export const metadata: Metadata = {
	title: "Saved",
};

// Saved listings depend on the signed-in seeker, so this page must never be
// statically cached.
export const dynamic = "force-dynamic";

export default async function SavedPage() {
	const { userId, getToken } = await auth();

	if (!userId) {
		return (
			<BucketPage
				title="Saved"
				description="Opportunities you saved while swiping."
			>
				<EmptyState
					title="Sign in to see your saved listings"
					message="Save opportunities while you swipe and they'll show up here."
				/>
			</BucketPage>
		);
	}

	const token = await getToken();
	if (!token) {
		return (
			<BucketPage
				title="Saved"
				description="Opportunities you saved while swiping."
			>
				<EmptyState
					title="Sign in to see your saved listings"
					message="Save opportunities while you swipe and they'll show up here."
				/>
			</BucketPage>
		);
	}

	const savedIds = await getSavedListingIds(token, userId).catch(() => [] as string[]);

	// Single batch query (replaces the previous per-id N+1 loop). `.in(...)` does
	// not guarantee row order, so re-order to match savedIds (newest-saved first)
	// by looking each row up by id.
	const rows = await getPublicListingsByIds(savedIds);
	const rowById = new Map(rows.map((row) => [row.id, row] as const));
	const listings: DiscoveryListing[] = savedIds
		.map((id) => rowById.get(id))
		.filter((row): row is NonNullable<typeof row> => row !== undefined)
		.map((row) => rowToDiscoveryFields(row) as DiscoveryListing);

	return (
		<BucketPage title="Saved" description="Opportunities you saved while swiping.">
			{listings.length === 0 ? (
				<EmptyState
					illustration="empty.savedListings"
					title="No saved listings yet"
					message="Swipe right or tap Save on an opportunity to keep it here for later."
					actionLabel="Start swiping"
					actionHref="/swipe"
				/>
			) : (
				<SavedCardGrid listings={listings} />
			)}
		</BucketPage>
	);
}
