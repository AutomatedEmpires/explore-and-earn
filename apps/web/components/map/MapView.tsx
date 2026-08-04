"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import MapboxMap, { Marker, Popup, type MapRef } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { Icon, Skeleton } from "@explore-and-earn/ui";

import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  EmptyState,
  ListingCard,
  ListingCardProvider,
  type DiscoveryListing,
  type ListingCardPopupOverrides,
} from "../discovery";
import { MAPPIN_ICON } from "../seeker/mappin";
import { SeekFilterPopup, type SeekFilterPopupValue } from "../seeker/SeekFilterPopup";
import { SeekSortPopup } from "../seeker/SeekSortPopup";
import { byMonetization, type MonetizationInputs } from "../../lib/ranking";
import { SEEKER_DISCOVERY_EVENTS, captureEvent } from "../../lib/analytics";
import { setMapListingDecisionAction } from "../../app/actions/mapDecisions";
import type { ExclusiveListingDecision } from "../../lib/exclusiveListingDecision";
import styles from "./MapView.module.css";

export interface MapViewProps {
  readonly listings: readonly DiscoveryListing[];
  readonly initialFocusId?: string;
  /** Whether card decisions may write for the current viewer. */
  readonly isAuthenticated?: boolean;
  /** Persisted relationship state read by the authenticated server page. */
  readonly initialSavedListingIds?: readonly string[];
  readonly initialSkippedListingIds?: readonly string[];
  /** Server-attested preview fixture ids with known-empty benefit detail. */
  readonly knownEmptyBenefitDetailsListingIds?: readonly string[];
  /**
   * Mapbox access token, read in the server component (map/page.tsx) and passed
   * down. Falls back to the client-inlined env var, but the prop is the reliable
   * path: this component is dynamically imported with `ssr: false`, so reading
   * `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` here alone can resolve empty.
   */
  readonly mapboxToken?: string;
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

/** Current map viewport, in geographic degrees. Null until the map first loads. */
interface ViewBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

const USA_VIEW = { longitude: -98.5795, latitude: 39.8283, zoom: 4 } as const;
const MAP_STYLE = { width: "100%", height: "100%" };
const EMPTY_LISTING_IDS: readonly string[] = [];

const EMPTY_FILTERS: SeekFilterPopupValue = {
  housing: false,
  meals: false,
  visaSupport: false,
};

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

/** Monetization inputs a listing supplies on the map surface (boosted + tier + match). */
function toRankInputs(listing: DiscoveryListing): MonetizationInputs {
  return {
    boosted: listing.conditionalBadges?.includes("boosted"),
    hostTier: listing.host?.tier,
    matchScore: listing.matchScore,
  };
}

/**
 * Best-effort "starts within N months" test. `begins` is a human string
 * ("Aug 12, 2026", "Rolling", "Flexible"); only concrete, parseable dates are
 * filtered. Unknown / unparseable timing is never hidden — an active filter
 * orders and screens, but a listing with no readable start date still shows.
 */
function beginsWithin(begins: string | undefined, months: number): boolean {
  if (!begins) return true;
  const when = new Date(begins);
  if (Number.isNaN(when.getTime())) return true;
  const limit = new Date();
  limit.setMonth(limit.getMonth() + months);
  return when <= limit;
}

/** Client-side filter predicate mirroring the Seek sort + filter controls. */
function matchesFilters(
  listing: MappedListing,
  lane: OpportunityCategory | null,
  filters: SeekFilterPopupValue,
): boolean {
  if (lane && listing.category !== lane) return false;
  // Housing / Meals "included" mirrors the card's green state: anything but
  // an explicit not_provided counts as offered.
  if (filters.housing && listing.benefits.housing.provision === "not_provided") {
    return false;
  }
  if (filters.meals && listing.benefits.meals.provision === "not_provided") {
    return false;
  }
  if (filters.visaSupport && !listing.visaSupport) return false;
  if (filters.payMin && filters.payMin > 0) {
    const cents = listing.payInsight?.minCents;
    if (cents == null) return false;
    const unit = listing.payInsight?.unit;
    if (filters.payUnit && unit && unit !== filters.payUnit) return false;
    if (cents / 100 < filters.payMin) return false;
  }
  if (filters.startRangeMonths && !beginsWithin(listing.begins, filters.startRangeMonths)) {
    return false;
  }
  return true;
}

function inViewport(listing: MappedListing, bounds: ViewBounds): boolean {
  const { lat, lon } = listing.coordinates;
  return (
    lat <= bounds.north &&
    lat >= bounds.south &&
    lon <= bounds.east &&
    lon >= bounds.west
  );
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

export function MapView({
  listings,
  initialFocusId,
  mapboxToken,
  isAuthenticated = false,
  initialSavedListingIds = EMPTY_LISTING_IDS,
  initialSkippedListingIds = EMPTY_LISTING_IDS,
  knownEmptyBenefitDetailsListingIds,
}: MapViewProps) {
  const router = useRouter();
  const token = mapboxToken ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef | null>(null);
  const trayStartY = useRef<number | null>(null);

  const mapped = useMemo(() => listings.filter(hasCoordinates), [listings]);

  // ── Immersive sort + filter (reuse the Seek controls) ──────────────────────
  const [lane, setLane] = useState<OpportunityCategory | null>(null);
  const [filters, setFilters] = useState<SeekFilterPopupValue>(EMPTY_FILTERS);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const filterCount = useMemo(() => {
    let n = 0;
    if (filters.housing) n += 1;
    if (filters.meals) n += 1;
    if (filters.visaSupport) n += 1;
    if (filters.startRangeMonths) n += 1;
    if (filters.payMin && filters.payMin > 0) n += 1;
    return n;
  }, [filters]);

  const filtered = useMemo(
    () => mapped.filter((listing) => matchesFilters(listing, lane, filters)),
    [mapped, lane, filters],
  );

  // ── Viewport-scoped markers + tray (Zillow "search this area") ─────────────
  const [bounds, setBounds] = useState<ViewBounds | null>(null);

  const visible = useMemo(() => {
    if (!bounds) return filtered;
    return filtered.filter((listing) => inViewport(listing, bounds));
  }, [filtered, bounds]);

  const markerGroups = useMemo(() => groupMarkers(visible), [visible]);

  // In-view listings, ordered by the shared monetization rule (never hides).
  const trayListings = useMemo(
    () => [...visible].sort(byMonetization(toRankInputs)),
    [visible],
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    initialFocusId ?? null,
  );
  const [trayOpen, setTrayOpen] = useState(Boolean(initialFocusId));
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const initialDecisions = useMemo(() => {
    const next = new Map<string, ExclusiveListingDecision>();
    for (const listing of mapped) {
      if (listing.previouslySkipped) next.set(listing.id, "skipped");
    }
    for (const id of initialSkippedListingIds) next.set(id, "skipped");
    // Saved wins if stale/legacy data ever contains both relationships.
    for (const id of initialSavedListingIds) next.set(id, "saved");
    return next;
  }, [initialSavedListingIds, initialSkippedListingIds, mapped]);
  const [decisions, setDecisions] = useState<
    ReadonlyMap<string, ExclusiveListingDecision>
  >(() => initialDecisions);
  const decisionsRef = useRef(new Map(initialDecisions));
  const decisionVersions = useRef(new Map<string, number>());
  const decisionQueues = useRef(new Map<string, Promise<void>>());

  // A server navigation may update these props without remounting the dynamic
  // map. Keep both the rendered map and the imperative optimistic-write ref on
  // the same authenticated snapshot.
  useEffect(() => {
    const next = new Map(initialDecisions);
    decisionsRef.current = next;
    setDecisions(next);
  }, [initialDecisions]);

  // A ?focus=<id> deep link can point at a listing the map can't show — one with
  // no coordinates, or one filtered out of the map query entirely (e.g. an
  // applied listing, now hard-hidden). Rather than silently no-op over an empty
  // map, fall back to that listing's detail page so the link still lands.
  useEffect(() => {
    if (initialFocusId && !mapped.some((listing) => listing.id === initialFocusId)) {
      router.replace(`/listing/${initialFocusId}`);
    }
  }, [initialFocusId, mapped, router]);

  // Popup resolves against the filtered set: a listing screened out by the sort
  // or filters closes its popup instead of floating over an empty map.
  const selected = useMemo(
    () => filtered.find((listing) => listing.id === selectedId) ?? null,
    [filtered, selectedId],
  );

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

  // Sync the tracked viewport from the live map (on load + after every pan/zoom)
  // so markers and the tray re-query to what's currently on screen.
  const syncBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = map.getBounds();
    if (!next) return;
    setBounds({
      north: next.getNorth(),
      south: next.getSouth(),
      east: next.getEast(),
      west: next.getWest(),
    });
  }, []);

  /**
   * The region-search event.
   *
   * NO COORDINATES LEAVE THE PAGE. The properties are a zoom level and a result
   * count — never the bounds, because a signed-in seeker panning around where
   * they live would be emitting their home location to an analytics vendor one
   * viewport at a time. Zoom answers "were they scanning a state or a street",
   * which is the product question, without answering "which street".
   */
  const reportRegion = useCallback(() => {
    const map = mapRef.current;
    captureEvent(SEEKER_DISCOVERY_EVENTS.mapRegionSearched, {
      zoom: map ? Math.round(map.getZoom()) : undefined,
    });
  }, []);

  const focusListing = (listing: MappedListing) => {
    setSelectedId(listing.id);
    mapRef.current?.flyTo({
      center: [listing.coordinates.lon, listing.coordinates.lat],
      duration: 700,
    });
  };

  // Map cards use the same authenticated persistence actions and optimistic
  // relationship states as Seek. Signed-out taps retain intent through the
  // sign-in return path; no visible control is backed by a no-op handler.
  const requireAuth = useCallback((): boolean => {
    if (isAuthenticated) return false;
    router.push(`/sign-in?role=seeker&returnTo=${encodeURIComponent("/map")}`);
    return true;
  }, [isAuthenticated, router]);

  const setLocalDecision = useCallback(
    (id: string, decision: ExclusiveListingDecision | null) => {
      const next = new Map(decisionsRef.current);
      if (decision) next.set(id, decision);
      else next.delete(id);
      decisionsRef.current = next;
      setDecisions(next);
    },
    [],
  );

  /**
   * Serialize writes per listing so rapid Save -> Skip taps cannot interleave
   * into contradictory rows. The latest tap stays optimistic; only its result
   * may reconcile local state, while each queued server transition observes
   * the persistence left by the transition before it.
   */
  const queueDecision = useCallback(
    (id: string, next: ExclusiveListingDecision) => {
      const previous = decisionsRef.current.get(id) ?? null;
      setLocalDecision(id, next);

      const version = (decisionVersions.current.get(id) ?? 0) + 1;
      decisionVersions.current.set(id, version);
      const prior = decisionQueues.current.get(id) ?? Promise.resolve();
      const task = prior
        .catch(() => undefined)
        .then(async () => {
          try {
            const result = await setMapListingDecisionAction(id, next);
            if (decisionVersions.current.get(id) !== version) return;
            setLocalDecision(
              id,
              result.decision === undefined ? previous : result.decision,
            );
          } catch {
            if (decisionVersions.current.get(id) === version) {
              setLocalDecision(id, previous);
            }
          }
        });
      decisionQueues.current.set(id, task);
      void task.finally(() => {
        if (decisionQueues.current.get(id) === task) {
          decisionQueues.current.delete(id);
        }
      });
    },
    [setLocalDecision],
  );

  const cardOverrides = useMemo<ListingCardPopupOverrides>(
    () => ({
      onApply: (id) => {
        // The listing page owns the resumable auth/apply intent. Routing there
        // first preserves this exact listing for signed-out seekers.
        router.push(`/listing/${id}?apply=1`);
      },
      onSave: (id) => {
        if (requireAuth()) return;
        queueDecision(id, "saved");
        captureEvent(SEEKER_DISCOVERY_EVENTS.listingSaved, { surface: "map" });
      },
      onSkip: (id) => {
        if (requireAuth()) return;
        queueDecision(id, "skipped");
        captureEvent(SEEKER_DISCOVERY_EVENTS.listingSkipped, { surface: "map" });
      },
    }),
    [queueDecision, requireAuth, router],
  );

  const cardState = useCallback(
    (id: string) => decisions.get(id),
    [decisions],
  );

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
        illustration="error.generic"
        title="Map unavailable"
        message="The map could not be loaded right now. You can still browse every opportunity from the Seek tab — please try the map again shortly."
      />
    );
  }

  if (mapped.length === 0) {
    return (
      <EmptyState
        illustration="empty.map"
        title="No mapped opportunities"
        message="None of the current opportunities have a fixed location yet. Head to the Seek tab to browse everything, including remote roles."
      />
    );
  }

  const sortLabel = lane ? CATEGORY_LABEL[lane] : "Sort";
  const sortIcon = lane ? CATEGORY_ICON[lane] : "action.sort";

  return (
    // ONE shared popup host for every card on the map — the pin Popup card AND
    // the swipe-up tray cards. Host / Benefit / Pay / Report open from the
    // provider defaults; the map-specific Open + Location behaviors (focus a
    // pin, don't navigate/quick-peek) are per-card overrides below.
    <ListingCardProvider
      listings={mapped}
      overrides={cardOverrides}
      analyticsSurface="map"
      knownEmptyBenefitDetailsListingIds={knownEmptyBenefitDetailsListingIds}
    >
    <div className={styles.shell}>
      <div className={styles.canvas}>
        <MapboxMap
          ref={mapRef}
          mapboxAccessToken={token}
          initialViewState={initialViewState}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={MAP_STYLE}
          onLoad={() => {
            setLoaded(true);
            syncBounds();
          }}
          onMoveEnd={() => {
            syncBounds();
            reportRegion();
          }}
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
                  <ListingCard
                    listing={selected}
                    surface="map"
                    cardState={cardState(selected.id)}
                    overrides={{
                      onOpen: (id) => setSelectedId(id),
                      onLocationClick: (id) => setSelectedId(id),
                    }}
                  />
                </div>
              </div>
            </Popup>
          ) : null}
        </MapboxMap>
      </div>

      {/* ── Floating sort (left) + filter (right) over the map ── */}
      <div className={styles.controlBar}>
        <button
          type="button"
          className={lane ? `${styles.control} ${styles.controlActive}` : styles.control}
          onClick={() => setSortOpen(true)}
        >
          <Icon name={sortIcon} size={16} aria-hidden />
          <span className={styles.controlLabel}>{sortLabel}</span>
        </button>
        <button
          type="button"
          className={filterCount > 0 ? `${styles.control} ${styles.controlActive}` : styles.control}
          onClick={() => setFilterOpen(true)}
        >
          <Icon name="action.filter" size={16} aria-hidden />
          <span className={styles.controlLabel}>Filter</span>
          {filterCount > 0 ? (
            <span className={styles.controlCount}>{filterCount}</span>
          ) : null}
        </button>
      </div>

      {!loaded ? (
        <div className={styles.loading} aria-hidden="true">
          <Skeleton variant="rect" />
        </div>
      ) : null}

      {/* ── Swipe-up listing view: what's currently in the map viewport ── */}
      <section
        className={trayOpen ? `${styles.tray} ${styles.trayOpen}` : styles.tray}
        aria-label="Map listings tray"
      >
        <button
          type="button"
          className={styles.trayHandle}
          onPointerDown={onTrayPointerDown}
          onPointerUp={onTrayPointerUp}
          aria-expanded={trayOpen}
        >
          <span className={styles.trayGrip} aria-hidden />
          <span className={styles.trayTitle}>
            {trayOpen ? "Hide listings" : "Swipe up for listings in view"}
          </span>
          <span className={styles.trayMeta}>
            {trayListings.length}{" "}
            {trayListings.length === 1 ? "in view" : "in view"}
          </span>
        </button>
        <div className={styles.trayBody}>
          {/* LOCATION PRECISION (074). A listing's latitude/longitude is a point
              the HOST placed and can clear at any time; the constraint set only
              guarantees the pair is complete, in-bounds, and accompanied by a
              display label. It is not a surveyed address and must never be
              presented as one, so the tray says what a pin is before the seeker
              plans a journey around it. */}
          <p className={styles.precisionNote}>
            <Icon name="system.info" size={14} aria-hidden />
            Pins show the place each host chose to publish — an area, not a
            street address. Confirm the exact address with the host before you
            travel.
          </p>
          {trayListings.length === 0 ? (
            <p className={styles.trayEmpty}>
              No opportunities in this view. Pan or zoom out, or loosen your
              filters.
            </p>
          ) : (
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
                  <ListingCard
                    listing={listing}
                    surface="map"
                    cardState={cardState(listing.id)}
                    overrides={{
                      onOpen: (id) => {
                        const next = mapped.find((item) => item.id === id);
                        if (next) {
                          focusListing(next);
                          setTrayOpen(true);
                        }
                      },
                      onLocationClick: (id) => {
                        const next = mapped.find((item) => item.id === id);
                        if (next) {
                          focusListing(next);
                        }
                      },
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <SeekSortPopup
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        category={lane ?? undefined}
        onApply={(next) => {
          setLane(next);
          setSortOpen(false);
        }}
      />

      <SeekFilterPopup
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onApply={(next) => {
          setFilters(next);
          setFilterOpen(false);
        }}
      />
    </div>
    </ListingCardProvider>
  );
}
