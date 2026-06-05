"use client";

import { useMemo, useState } from "react";
import Map, { Marker, Popup } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { DiscoveryCard, Icon, Skeleton } from "@explore-and-earn/ui";

import {
  EmptyState,
  toDiscoveryCardData,
  type DiscoveryListing,
} from "../discovery";
import { MAPPIN_ICON } from "../seeker/mappin";
import styles from "./MapView.module.css";

export interface MapViewProps {
  readonly listings: readonly DiscoveryListing[];
  /** Optional listing id to auto-open on mount (from the ?focus=<id> deep link). */
  readonly initialFocusId?: string;
}

/** A listing that is guaranteed to carry coordinates (post-filter). */
type MappedListing = DiscoveryListing & {
  readonly coordinates: { readonly lat: number; readonly lon: number };
};

/** Geographic centre of the contiguous USA — the default view on load. */
const USA_VIEW = { longitude: -98.5795, latitude: 39.8283, zoom: 4 } as const;

/** The Mapbox canvas fills its bordered container. */
const MAP_STYLE = { width: "100%", height: "100%" };

function hasCoordinates(listing: DiscoveryListing): listing is MappedListing {
  return listing.coordinates != null;
}

/**
 * Interactive Mapbox map for the seeker /map route. Renders one marker per
 * listing that has coordinates; clicking a marker opens that listing's
 * canonical DiscoveryCard (surface="map") in a popup. Handles the loading,
 * empty (no geocoded listings), and error / missing-token states.
 *
 * This is the ONLY client component in the /map surface — the route page stays
 * a server component and passes already-fetched listings in.
 */
export function MapView({ listings, initialFocusId }: MapViewProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const mapped = useMemo(() => listings.filter(hasCoordinates), [listings]);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialFocusId ?? null,
  );
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const selected = useMemo(
    () => mapped.find((listing) => listing.id === selectedId) ?? null,
    [mapped, selectedId],
  );

  const initialViewState = useMemo(() => {
    const focus = initialFocusId
      ? mapped.find((listing) => listing.id === initialFocusId)
      : undefined;
    return focus
      ? { longitude: focus.coordinates.lon, latitude: focus.coordinates.lat, zoom: 6 }
      : USA_VIEW;
  }, [initialFocusId, mapped]);

  // Missing token (Doppler not wired) or a runtime map failure: graceful state.
  if (!token || errored) {
    return (
      <EmptyState
        title="Map unavailable"
        message="The map could not be loaded right now. You can still browse every opportunity from the Seek tab — please try the map again shortly."
      />
    );
  }

  // No listing carries coordinates (e.g. only remote roles): nothing to plot.
  if (mapped.length === 0) {
    return (
      <EmptyState
        title="No mapped opportunities"
        message="None of the current opportunities have a fixed location yet. Head to the Seek tab to browse everything, including remote roles."
      />
    );
  }

  return (
    <div className={styles.wrap}>
      <Map
        mapboxAccessToken={token}
        initialViewState={initialViewState}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={MAP_STYLE}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        reuseMaps
      >
        {mapped.map((listing) => (
          <Marker
            key={listing.id}
            longitude={listing.coordinates.lon}
            latitude={listing.coordinates.lat}
            anchor="bottom"
          >
            <button
              type="button"
              className={styles.pin}
              aria-label={`${listing.title} — ${listing.location}`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedId(listing.id);
              }}
            >
              <Icon name={MAPPIN_ICON[listing.category]} size={24} aria-hidden />
            </button>
          </Marker>
        ))}

        {selected ? (
          <Popup
            longitude={selected.coordinates.lon}
            latitude={selected.coordinates.lat}
            anchor="bottom"
            offset={28}
            closeOnClick={false}
            onClose={() => setSelectedId(null)}
            className={styles.popup}
            maxWidth="320px"
          >
            <div className={styles.popupCard}>
              <DiscoveryCard
                data={toDiscoveryCardData(selected)}
                surface="map"
              />
            </div>
          </Popup>
        ) : null}
      </Map>

      {!loaded ? (
        <div className={styles.loading} aria-hidden="true">
          <Skeleton variant="rect" />
        </div>
      ) : null}
    </div>
  );
}
