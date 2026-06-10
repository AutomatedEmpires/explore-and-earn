"use client";

import { useRouter } from "next/navigation";
import { DiscoveryCard } from "@explore-and-earn/ui";

import { toDiscoveryCardData, type DiscoveryListing } from "../discovery";
import styles from "./LifecycleList.module.css";

export interface SavedCardGridProps {
	readonly listings: readonly DiscoveryListing[];
}

/**
 * Client wrapper for the saved listings grid. Provides navigation handlers so
 * the "Quick Apply" CTA resolves to the listing detail page rather than firing
 * nothing. The server component fetches data; this component owns interactivity.
 */
export function SavedCardGrid({ listings }: SavedCardGridProps) {
	const router = useRouter();

	return (
		<div className={styles.grid}>
			{listings.map((listing) => (
				<DiscoveryCard
					key={listing.id}
					data={toDiscoveryCardData(listing)}
					surface="discovery_feed"
					cardState="saved"
					onOpen={(id) => router.push(`/listing/${id}`)}
					onApply={(id) => router.push(`/listing/${id}`)}
				/>
			))}
		</div>
	);
}
