"use client";

import { useMemo, useState } from "react";
import { DiscoveryCard, Icon } from "@explore-and-earn/ui";

import {
	BenefitBucketDrawer,
	EmptyState,
	HostProfilePopup,
	QuickPeekDrawer,
	toDiscoveryCardData,
	type BenefitBucket,
	type DiscoveryListing,
} from "../discovery";
import { MAPPIN_ICON } from "./mappin";
import styles from "./OpportunityMap.module.css";

interface RegionGroup {
	readonly region: string;
	readonly listings: readonly DiscoveryListing[];
}

/**
 * Derive a coarse region label from a listing's location string. We key on the
 * segment after the last comma (state / country), falling back to the whole
 * string for comma-free locations like "Remote · Worldwide".
 */
function regionOf(location: string): string {
	const parts = location.split(",");
	return parts[parts.length - 1].trim();
}

/** Group listings by derived region, preserving first-seen order. */
function groupByRegion(listings: readonly DiscoveryListing[]): readonly RegionGroup[] {
	const groups = new Map<string, DiscoveryListing[]>();
	for (const listing of listings) {
		const region = regionOf(listing.location);
		const existing = groups.get(region);
		if (existing) {
			existing.push(listing);
		} else {
			groups.set(region, [listing]);
		}
	}
	return Array.from(groups, ([region, grouped]) => ({ region, listings: grouped }));
}

export interface OpportunityMapProps {
	readonly listings: readonly DiscoveryListing[];
}

/**
 * OpportunityMap — the /map surface. Sprint Zero ships a location-grouped
 * index (no map library is in the frozen dependency set), built on the SINGLE
 * canonical DiscoveryCard ("map" surface) plus the canonical mappin.* pins. It
 * answers "what's open, and where" by clustering opportunities under their
 * region, each card flagged with its category pin. Tapping a card opens the
 * lane-local QuickPeekDrawer with the full listing detail (the same drawer the
 * Seek tab uses); tapping the host identity circle opens the HostProfilePopup;
 * tapping the Housing or Meals cell opens the BenefitBucketDrawer, so the
 * surfaces never drift. When a real tile/vector map + geocoded listings land
 * with the data layer, this view-model swaps in behind the same component
 * contract.
 *
 * UI-only (Sprint Zero): no geocoding, backend, or persistence.
 */
export function OpportunityMap({ listings }: OpportunityMapProps) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const [activeHostId, setActiveHostId] = useState<string | null>(null);
	const [activeBenefit, setActiveBenefit] = useState<{
		readonly id: string;
		readonly bucket: BenefitBucket;
	} | null>(null);
	const activeListing = useMemo(
		() => listings.find((listing) => listing.id === activeId) ?? null,
		[listings, activeId],
	);
	const activeHost = useMemo(
		() => listings.find((listing) => listing.id === activeHostId)?.host ?? null,
		[listings, activeHostId],
	);
	const activeBenefitListing = useMemo(
		() => listings.find((listing) => listing.id === activeBenefit?.id) ?? null,
		[listings, activeBenefit],
	);

	if (listings.length === 0) {
		return (
			<EmptyState
				title="No opportunities on the map yet"
				message="As hosts post roles, they'll appear here grouped by location."
			/>
		);
	}

	const groups = groupByRegion(listings);
	const opportunityWord = listings.length === 1 ? "opportunity" : "opportunities";
	const locationWord = groups.length === 1 ? "location" : "locations";
	const summary = `${listings.length} ${opportunityWord} across ${groups.length} ${locationWord}`;

	return (
		<div className={styles.map} aria-label="Opportunities by location">
			<p className={styles.summary}>{summary}</p>

			{groups.map((group) => (
				<section className={styles.region} key={group.region}>
					<header className={styles.regionHeader}>
						<Icon name="mappin.cluster" size={24} aria-hidden />
						<h2 className={styles.regionName}>{group.region}</h2>
						<span className={styles.regionCount}>{group.listings.length}</span>
					</header>

					<ul className={styles.pins}>
						{group.listings.map((listing) => (
							<li className={styles.pin} key={listing.id}>
								<span className={styles.pinMarker} aria-hidden>
									<Icon name={MAPPIN_ICON[listing.category]} size={20} />
								</span>
								<div className={styles.pinCard}>
									<DiscoveryCard
										data={toDiscoveryCardData(listing)}
										surface="map"
										onOpen={(id) => setActiveId(id)}
										onHostClick={(id) => setActiveHostId(id)}
										onHousingClick={(id) =>
											setActiveBenefit({ id, bucket: "housing" })
										}
										onMealsClick={(id) =>
											setActiveBenefit({ id, bucket: "meals" })
										}
									/>
								</div>
							</li>
						))}
					</ul>
				</section>
			))}

			<QuickPeekDrawer listing={activeListing} onClose={() => setActiveId(null)} />

			<HostProfilePopup
				host={activeHost}
				listings={listings}
				onClose={() => setActiveHostId(null)}
				onSelectListing={(id) => {
					setActiveHostId(null);
					setActiveId(id);
				}}
			/>

			<BenefitBucketDrawer
				listing={activeBenefitListing}
				bucket={activeBenefit?.bucket ?? null}
				onClose={() => setActiveBenefit(null)}
			/>
		</div>
	);
}
