"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

import {
	ListingCard,
	ListingCardProvider,
	type DiscoveryListing,
} from "../discovery";
import styles from "./LifecycleList.module.css";

export interface SavedCardGridProps {
	readonly listings: readonly DiscoveryListing[];
}

/**
 * Client wrapper for the saved listings grid. Adopts the shared <ListingCard>
 * so a saved card gets the SAME wiring as the discovery feed — Quick Peek /
 * Host / Benefit / Pay / Report popups, location→map, the match pill (where a
 * stored score clears the threshold), the boosted marker, and the "previously
 * skipped" photo flag (Saved is a demote-but-visible surface). One popup host
 * is shared across the whole grid via the provider. The "Quick Apply" CTA
 * resolves to the listing detail page.
 */
export function SavedCardGrid({ listings }: SavedCardGridProps) {
	const router = useRouter();

	return (
		<ListingCardProvider
			listings={listings}
			overrides={{ onApply: (id) => router.push(`/listing/${id}`) }}
		>
			<div className={styles.grid}>
				{listings.map((listing, index) => (
					<div
						key={listing.id}
						className={styles.cell}
						style={{ "--i": index } as CSSProperties}
					>
						<ListingCard
							listing={listing}
							surface="discovery_feed"
							cardState="saved"
						/>
					</div>
				))}
			</div>
		</ListingCardProvider>
	);
}
