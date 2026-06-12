"use client";

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import MapboxMap, { Marker, Popup, type MapRef } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { DiscoveryCard, Icon, Skeleton } from "@explore-and-earn/ui";

import {
  BenefitTrustModal,
  EmptyState,
  HostProfilePopup,
  PayDetailsDrawer,
  ReportListingDrawer,
  toDiscoveryCardData,
  type DiscoveryListing,
} from "../discovery";
import { MAPPIN_ICON } from "../seeker/mappin";
import styles from "./MapView.module.css";

export interface MapViewProps {
  readonly listings: readonly DiscoveryListing[];
  readonly initialFocusId?: string;
}

type MappedListing = DiscoveryListing & {
  readonly coordinates: { readonly lat: number; readonly lon: number };
};

interface MarkerGroup {
  readonly id: string;
  readonly coordinates: { readonly lat: number; readonly lon: number };
  readonly listings: readonly MappedListing[];
  readonly category: OpportunityCategory;
}

const USA_VIEW = { longitude: -98.5795, latitude: 39.8283, zoom: 4 } as const;
const MAP_STYLE = { width: "100%", height: "100%" };

const MARKER_CLASS = {
  farm: styles.pinFarm,
  maritime: styles.pinMaritime,
  remote: styles.pinRemote,
  seasonal: styles.pinSeasonal,
  mix: styles.pinMix,
} as const;

function hasCoordinates(listing: DiscoveryListing): listing is MappedListing {
  return listing.coordinates != null;
}

function groupMarkers(listings: readonly MappedListing[]): MarkerGroup[] {
  const groups = new Map<string, MappedListing[]>();
  for (const listing of listings) {
    const key = `${listing.coordinates.lat.toFixed(3)}:${listing.coordinates.lon.toFixed(3)}`;
    const current = groups.get(key);
    if (current) {
      current.push(listing);
    } else {
      groups.set(key, [listing]);
    }
  }

  return Array.from(groups.entries()).map(([id, grouped]) => {
    const categories = new Set(grouped.map((listing) => listing.category));
    return {
      id,
      coordinates: grouped[0].coordinates,
      listings: grouped,
      category: categories.size === 1 ? grouped[0].category : "mix",
    };
  });
}

export function MapView({ listings, initialFocusId }: MapViewProps) {
  const router = useRouter();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef | null>(null);
  const trayStartY = useRef<number | null>(null);

  const mapped = useMemo(() => listings.filter(hasCoordinates), [listings]);
  const markerGroups = useMemo(() => groupMarkers(mapped), [mapped]);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialFocusId ?? null,
  );
  const [trayOpen, setTrayOpen] = useState(Boolean(initialFocusId));
  const [activeHostId, setActiveHostId] = useState<string | null>(null);
  const [activeBenefit, setActiveBenefit] = useState<{
    readonly id: string;
    readonly bucket: "housing" | "meals";
  } | null>(null);
  const [activePayId, setActivePayId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const selected = useMemo(
    () => mapped.find((listing) => listing.id === selectedId) ?? null,
    [mapped, selectedId],
  );

  const activeHost = useMemo(
    () => mapped.find((listing) => listing.id === activeHostId)?.host ?? null,
    [mapped, activeHostId],
  );

  const activeBenefitListing = useMemo(
    () => mapped.find((listing) => listing.id === activeBenefit?.id) ?? null,
    [mapped, activeBenefit],
  );

  const activePayListing = useMemo(
    () => mapped.find((listing) => listing.id === activePayId) ?? null,
    [mapped, activePayId],
  );

  const activeReportListing = useMemo(
    () => mapped.find((listing) => listing.id === reportId) ?? null,
    [mapped, reportId],
  );

  const trayListings = useMemo(() => {
    if (!selectedId) {
      return mapped;
    }
    const selectedListing = mapped.find((listing) => listing.id === selectedId);
    if (!selectedListing) {
      return mapped;
    }
    return [selectedListing, ...mapped.filter((listing) => listing.id !== selectedId)];
  }, [mapped, selectedId]);

  const initialViewState = useMemo(() => {
    const focus = initialFocusId
      ? mapped.find((listing) => listing.id === initialFocusId)
      : undefined;
    return focus
      ? {
          longitude: focus.coordinates.lon,
          latitude: focus.coordinates.lat,
          zoom: 6,
        }
      : USA_VIEW;
  }, [initialFocusId, mapped]);

  const focusListing = (listing: MappedListing) => {
    setSelectedId(listing.id);
    mapRef.current?.flyTo({
      center: [listing.coordinates.lon, listing.coordinates.lat],
      duration: 700,
    });
  };

  const onTrayPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    trayStartY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTrayPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const startY = trayStartY.current;
    trayStartY.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer capture already released */
    }

    if (startY == null) {
      setTrayOpen((value) => !value);
      return;
    }

    const delta = event.clientY - startY;
    if (delta < -40) {
      setTrayOpen(true);
      return;
    }
    if (delta > 40) {
      setTrayOpen(false);
      return;
    }
    setTrayOpen((value) => !value);
  };

  if (!token || errored) {
    return (
      <EmptyState
        title="Map unavailable"
        message="The map could not be loaded right now. You can still browse every opportunity from the Seek tab — please try the map again shortly."
      />
    );
  }

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
      <div className={styles.canvas}>
        <MapboxMap
          ref={mapRef}
          mapboxAccessToken={token}
          initialViewState={initialViewState}
          mapStyle="mapbox://styles/mapbox/light-v11"
          style={MAP_STYLE}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          onClick={() => setSelectedId(null)}
          reuseMaps
        >
          {markerGroups.map((group) => (
            <Marker
              key={group.id}
              longitude={group.coordinates.lon}
              latitude={group.coordinates.lat}
              anchor="bottom"
            >
              <button
                type="button"
                className={`${styles.pin} ${MARKER_CLASS[group.category]}${group.listings.length > 1 ? ` ${styles.pinCluster}` : ""}`}
                aria-label={
                  group.listings.length > 1
                    ? `${group.listings.length} opportunities near ${group.listings[0].location}`
                    : `${group.listings[0].title} — ${group.listings[0].location}`
                }
                onClick={(event) => {
                  event.stopPropagation();
                  const firstListing = group.listings[0];
                  setSelectedId(firstListing.id);
                  if (group.listings.length > 1) {
                    setTrayOpen(true);
                  }
                }}
              >
                {group.listings.length > 1 ? (
                  <span className={styles.clusterCount}>{group.listings.length}</span>
                ) : (
                  <Icon name={MAPPIN_ICON[group.category]} size={24} aria-hidden />
                )}
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
              maxWidth="360px"
            >
              <div className={styles.popupCard}>
                <div className={styles.popupFrame}>
                  <div className={styles.popupHeader}>
                    <span className={styles.popupEyebrow}>Pinned opportunity</span>
                    <span className={styles.popupMeta}>{selected.opportunityWindow}</span>
                  </div>
                  <DiscoveryCard
                    data={toDiscoveryCardData(selected)}
                    surface="map"
                    onOpen={(id) => setSelectedId(id)}
                    onApply={(id) => router.push(`/listing/${id}`)}
                    onHostClick={(id) => setActiveHostId(id)}
                    onLocationClick={(id) => setSelectedId(id)}
                    onHousingClick={(id) =>
                      setActiveBenefit({ id, bucket: "housing" })
                    }
                    onMealsClick={(id) => setActiveBenefit({ id, bucket: "meals" })}
                    onPayClick={(id) => setActivePayId(id)}
                    onReport={(id) => setReportId(id)}
                  />
                </div>
              </div>
            </Popup>
          ) : null}
        </MapboxMap>
      </div>

      {!loaded ? (
        <div className={styles.loading} aria-hidden="true">
          <Skeleton variant="rect" />
        </div>
      ) : null}

      <section
        className={trayOpen ? `${styles.tray} ${styles.trayOpen}` : styles.tray}
        aria-label="Map listings tray"
      >
        <button
          type="button"
          className={styles.trayHandle}
          onPointerDown={onTrayPointerDown}
          onPointerUp={onTrayPointerUp}
        >
          <span className={styles.trayGrip} aria-hidden />
          <span className={styles.trayTitle}>
            {trayOpen ? "Hide listing view" : "Swipe up for listing view"}
          </span>
          <span className={styles.trayMeta}>{mapped.length} mapped opportunities</span>
        </button>
        <div className={styles.trayBody}>
          <div className={styles.trayList}>
            {trayListings.map((listing) => (
              <div
                key={listing.id}
                className={
                  listing.id === selectedId
                    ? `${styles.trayCard} ${styles.trayCardActive}`
                    : styles.trayCard
                }
              >
                <DiscoveryCard
                  data={toDiscoveryCardData(listing)}
                  surface="map"
                  onOpen={(id) => {
                    const next = mapped.find((item) => item.id === id);
                    if (next) {
                      focusListing(next);
                      setTrayOpen(true);
                    }
                  }}
                  onApply={(id) => router.push(`/listing/${id}`)}
                  onHostClick={(id) => setActiveHostId(id)}
                  onLocationClick={(id) => {
                    const next = mapped.find((item) => item.id === id);
                    if (next) {
                      focusListing(next);
                    }
                  }}
                  onHousingClick={(id) =>
                    setActiveBenefit({ id, bucket: "housing" })
                  }
                  onMealsClick={(id) => setActiveBenefit({ id, bucket: "meals" })}
                  onPayClick={(id) => setActivePayId(id)}
                  onReport={(id) => setReportId(id)}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <HostProfilePopup
        host={activeHost}
        listings={mapped}
        onClose={() => setActiveHostId(null)}
        onSelectListing={(id) => {
          setActiveHostId(null);
          setSelectedId(id);
        }}
      />

      <BenefitTrustModal
        listing={activeBenefitListing}
        bucket={activeBenefit?.bucket ?? null}
        onClose={() => setActiveBenefit(null)}
      />

      <PayDetailsDrawer
        listing={activePayListing}
        onClose={() => setActivePayId(null)}
      />

      <ReportListingDrawer
        listing={activeReportListing}
        onClose={() => setReportId(null)}
      />
    </div>
  );
}
