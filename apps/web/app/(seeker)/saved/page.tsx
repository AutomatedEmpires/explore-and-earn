import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { DiscoveryCard } from "@explore-and-earn/ui";
import {
	getPublicListingById,
	getSavedListingIds,
	rowToDiscoveryFields,
} from "@explore-and-earn/db";

import {
	EmptyState,
	toDiscoveryCardData,
	type DiscoveryListing,
} from "../../../components/discovery";
import { BucketPage } from "../../../components/seeker";
import styles from "./page.module.css";

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

	const savedIds = await getSavedListingIds(token);

	// TODO(perf): N+1 query — each saved listing is fetched individually. Replace
	// with a single batch `getPublicListingsByIds(ids)` query in
	// `@explore-and-earn/db` once it exists. Intentionally not implemented here.
	const listings: DiscoveryListing[] = (
		await Promise.all(savedIds.map((id) => getPublicListingById(id)))
	)
		.filter((row): row is NonNullable<typeof row> => row !== null)
		.map((row) => rowToDiscoveryFields(row) as DiscoveryListing);

	return (
		<BucketPage title="Saved" description="Opportunities you saved while swiping.">
			{listings.length === 0 ? (
				<EmptyState
					title="No saved listings yet"
					message="Swipe right or tap Save on an opportunity to keep it here for later."
				/>
			) : (
				<div className={styles.grid}>
					{listings.map((listing) => (
						<DiscoveryCard
							key={listing.id}
							data={toDiscoveryCardData(listing)}
							surface="discovery_feed"
						/>
					))}
				</div>
			)}
		</BucketPage>
	);
}
