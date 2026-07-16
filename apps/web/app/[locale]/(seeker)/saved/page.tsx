import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import {
	type DiscoveryEnrichment,
	enrichmentFromScope,
	getMatchScoresForSeeker,
	getNonLiveSavedListings,
	getPublicListingsByIds,
	getSavedListingIds,
	resolveSeekerDiscoveryScope,
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

	// Same per-seeker enrichment as /seek/swipe/map: boosted badge, previously-
	// skipped flag, and the STORED >=75 match pill travel onto every saved card
	// (a saved listing must show the identical truth it shows everywhere else).
	// Best-effort — a scope fault degrades to plain cards, never a broken page.
	let enrichment: DiscoveryEnrichment | undefined;
	try {
		const [scope, scores] = await Promise.all([
			resolveSeekerDiscoveryScope(token, userId),
			getMatchScoresForSeeker(token, userId),
		]);
		enrichment = enrichmentFromScope(scope, scores);
	} catch {
		enrichment = undefined;
	}

	// Single batch query (replaces the previous per-id N+1 loop). `.in(...)` does
	// not guarantee row order, so re-order to match savedIds (newest-saved first)
	// by looking each row up by id.
	const rows = await getPublicListingsByIds(savedIds);
	const rowById = new Map(rows.map((row) => [row.id, row] as const));

	// Saved listings that are no longer live are invisible to the public read
	// (RLS is live-only) — fetch them via the dedicated honesty read (which
	// derives the id set from THIS seeker's own saved rows internally) so they
	// render as a muted "no longer available" card instead of silently
	// vanishing from the seeker's own saved bucket. Best-effort ([] on fault).
	const nonLiveRows = await getNonLiveSavedListings(token, userId);
	for (const row of nonLiveRows) rowById.set(row.id, row);

	const listings: DiscoveryListing[] = savedIds
		.map((id) => rowById.get(id))
		.filter((row): row is NonNullable<typeof row> => row !== undefined)
		.map((row) => rowToDiscoveryFields(row, enrichment) as DiscoveryListing);

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
