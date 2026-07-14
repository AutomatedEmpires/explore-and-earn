import { Icon, type IconKey } from "@explore-and-earn/ui";
import type { OpportunityCategory } from "@explore-and-earn/contracts";

import { ListingSection } from "./ListingSection";
import styles from "./LocationContext.module.css";

const MAPPIN_BY_CATEGORY: Record<OpportunityCategory, IconKey> = {
  farm: "mappin.farm",
  maritime: "mappin.maritime",
  remote: "mappin.remote",
  seasonal: "mappin.seasonal",
  mix: "mappin.mix",
};

export interface LocationContextProps {
  readonly locationDisplay: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly category: OpportunityCategory;
}

/** Format a coordinate pair as "47.42°N, 120.31°W" — honest, no invented places. */
function formatCoords(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}

/**
 * "Where you'll be" — grounds the opportunity in a real place using the listing's
 * coordinates. A category-tinted region panel with the place name and exact
 * coordinates; no fabricated distances, travel times, or landmarks. The page only
 * renders this when real coordinates exist.
 */
export function LocationContext({
  locationDisplay,
  latitude,
  longitude,
  category,
}: LocationContextProps) {
  return (
    <ListingSection
      title="Where you'll be"
      icon="nav.map"
      headingId="listing-location"
    >
      <div className={styles.panel} data-category={category}>
        <div className={styles.marker}>
          <Icon name={MAPPIN_BY_CATEGORY[category]} size={40} aria-hidden />
        </div>
        <div className={styles.body}>
          {locationDisplay ? (
            <span className={styles.place}>{locationDisplay}</span>
          ) : null}
          <span className={styles.coords}>{formatCoords(latitude, longitude)}</span>
          <p className={styles.note}>
            Show your family exactly where you&rsquo;re headed &mdash; drop these
            coordinates into any map app to see the area.
          </p>
        </div>
      </div>
    </ListingSection>
  );
}
