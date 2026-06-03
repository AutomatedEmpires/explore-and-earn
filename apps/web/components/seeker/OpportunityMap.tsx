import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { DiscoveryCard, Icon } from "@explore-and-earn/ui";
import type { IconKey } from "@explore-and-earn/ui";

import { EmptyState, toDiscoveryCardData, type DiscoveryListing } from "../discovery";
import styles from "./OpportunityMap.module.css";

/** Geographic pin icon per canonical category (never the deprecated mappin.location). */
const MAPPIN_ICON: Record<OpportunityCategory, IconKey> = {
	farm: "mappin.farm",
	maritime: "mappin.maritime",
	remote: "mappin.remote",
	seasonal: "mappin.seasonal",
	mix: "mappin.mix",
};

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
 * OpportunityMap — the /map surface. Sprint Zero ships a location-grouped index
 * (no map library is in the frozen dependency set), built on the SINGLE
 * canonical DiscoveryCard ("map" surface) plus the canonical mappin.* pins. It
 * answers "what's open, and where" by clustering opportunities under their
 * region, each card flagged with its category pin. When a real tile/vector map
 * + geocoded listings land with the data layer, this view-model swaps in behind
 * the same component contract.
 *
 * UI-only (Sprint Zero): no geocoding, backend, or persistence.
 */
export function OpportunityMap({ listings }: OpportunityMapProps) {
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
									<DiscoveryCard data={toDiscoveryCardData(listing)} surface="map" />
								</div>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
