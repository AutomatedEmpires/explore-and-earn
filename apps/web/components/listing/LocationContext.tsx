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
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly category: OpportunityCategory;
}

/** Format a coordinate pair as "47.42°N, 120.31°W" — honest, no invented places. */
function formatCoords(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}

/**
 * "About the location" — grounds the opportunity in the place the host stated.
 * Exact coordinates appear only when both values exist; a real place name still
 * deserves a section when coordinates have not been supplied. No fabricated
 * distances, travel times, or landmarks.
 */
export function LocationContext({
  locationDisplay,
  latitude,
  longitude,
  category,
}: LocationContextProps) {
  const locationName = locationDisplay?.trim() || null;
  const coordinates =
    latitude != null && longitude != null
      ? formatCoords(latitude, longitude)
      : null;

  return (
    <ListingSection
      title="About the location"
      icon="nav.map"
      headingId="listing-location"
    >
      <div className={styles.panel} data-category={category}>
        <div className={styles.marker}>
          <Icon name={MAPPIN_BY_CATEGORY[category]} size={40} aria-hidden />
        </div>
        <div className={styles.body}>
          {locationName ? (
            <span className={styles.place}>{locationName}</span>
          ) : null}
          {coordinates ? <span className={styles.coords}>{coordinates}</span> : null}
          {coordinates ? (
            <p className={styles.note}>
              Show your family exactly where you&rsquo;re headed &mdash; drop these
              coordinates into any map app to see the area.
            </p>
          ) : null}
        </div>
      </div>
    </ListingSection>
  );
}
