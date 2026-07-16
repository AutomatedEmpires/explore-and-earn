import {
  type DiscoveryEnrichment,
  encodeSwipeCursor,
  enrichmentFromScope,
  getLiveListingsWithCoords,
  getMatchScoresForSeeker,
  getPublicListingById,
  getSwipeBatch,
  resolveSeekerDiscoveryScope,
  rowToDiscoveryFields,
  SWIPE_BATCH_SIZE,
} from "@explore-and-earn/db";
import { getPublicListingsCached } from "../../lib/serverCache";
import { rankForSeeker } from "../../lib/ranking";
import { isDevBenchEnabled } from "../../lib/devBench";
import { DISCOVERY_FIXTURES } from "./fixtures";
import type { DiscoveryListing } from "./listing";

/**
 * Discovery data-access boundary — the seeker lane's single fetch seam.
 *
 * All seeker discovery surfaces (/seek, /swipe, /map, lifecycle buckets)
 * read through these functions. Backed by Supabase; returns live listings
 * with status='live', joined to host_profiles for display data.
 *
 * The exported function signatures are stable — UI surfaces, components, and
 * view-models do not need changes when the backing data changes.
 */

const hasPublicDataConfig =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const allowFixtureFallback = process.env.NODE_ENV !== "production";
const allowPreviewMapFixtures =
  process.env.NODE_ENV === "production" &&
  process.env.VERCEL_ENV === "preview" &&
  process.env.PREVIEW_MAP_FIXTURES === "1";

function reportDiscoveryFallback(context: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`[discovery] ${context}: falling back to fixtures in local dev. ${detail}`);
}

function reportMissingProductionDiscoveryConfig(context: string) {
  if (!hasPublicDataConfig && !allowFixtureFallback) {
    console.error(
      `[discovery] ${context}: public Supabase config is missing in production; fixture fallback is disabled.`,
    );
  }
}

/** All discoverable live opportunities. */
export async function getDiscoveryListings(): Promise<DiscoveryListing[]> {
  // DEV MOCK BENCH: deterministic fixtures over live data while impersonating.
  if (isDevBenchEnabled()) return [...DISCOVERY_FIXTURES];
  if (!hasPublicDataConfig) {
    if (allowFixtureFallback) {
      return [...DISCOVERY_FIXTURES];
    }

    reportMissingProductionDiscoveryConfig("getDiscoveryListings");
    return [];
  }

  try {
    const rows = await getPublicListingsCached();
    return rows.map((row) => rowToDiscoveryFields(row) as DiscoveryListing);
  } catch (error) {
    if (allowFixtureFallback) {
      reportDiscoveryFallback("getDiscoveryListings", error);
      return [...DISCOVERY_FIXTURES];
    }

    throw error;
  }
}

/** A single live opportunity by id, or null when not found. */
export async function getDiscoveryListingById(
  id: string,
): Promise<DiscoveryListing | null> {
  // DEV MOCK BENCH: deterministic fixtures over live data while impersonating.
  if (isDevBenchEnabled()) {
    return DISCOVERY_FIXTURES.find((listing) => listing.id === id) ?? null;
  }
  if (!hasPublicDataConfig) {
    if (allowFixtureFallback) {
      return DISCOVERY_FIXTURES.find((listing) => listing.id === id) ?? null;
    }

    reportMissingProductionDiscoveryConfig("getDiscoveryListingById");
    return null;
  }

  try {
    const row = await getPublicListingById(id);
    if (!row) return null;
    return rowToDiscoveryFields(row) as DiscoveryListing;
  } catch (error) {
    if (allowFixtureFallback) {
      reportDiscoveryFallback("getDiscoveryListingById", error);
      return DISCOVERY_FIXTURES.find((listing) => listing.id === id) ?? null;
    }

    throw error;
  }
}

/**
 * Live opportunities that carry coordinates — backs the /map surface.
 *
 * When a signed-in seeker's Clerk token + userId are threaded through, the
 * applied HARD-exclusion runs inside getLiveListingsWithCoords (applied pins are
 * dropped, never reshown as applyable) and the boosted / previously-skipped /
 * stored-match enrichment travels onto every pin via rowToDiscoveryFields. The
 * anonymous/public case (no auth) still works unchanged — no scope, no crash.
 */
export async function getDiscoveryListingsWithCoords(
  clerkToken?: string | null,
  clerkUserId?: string | null,
): Promise<DiscoveryListing[]> {
  // The Preview-only flag exists solely for remote Mapbox proof while the
  // isolated readiness database has no listings. It cannot activate in a
  // Vercel Production runtime and does not affect any non-map discovery seam.
  if (isDevBenchEnabled() || allowPreviewMapFixtures) {
    return DISCOVERY_FIXTURES.filter((listing) => Boolean(listing.coordinates));
  }
  if (!hasPublicDataConfig) {
    if (allowFixtureFallback) {
      return DISCOVERY_FIXTURES.filter((listing) => Boolean(listing.coordinates));
    }

    reportMissingProductionDiscoveryConfig("getDiscoveryListingsWithCoords");
    return [];
  }

  try {
    // Signed-in seeker: resolve the discovery scope + stored match scores ONCE so
    // the boosted/skipped/match enrichment can be stamped on every pin. The
    // applied HARD-exclusion is enforced inside getLiveListingsWithCoords from the
    // same token+userId. Best-effort — a scope fault degrades to the public,
    // unenriched map rather than breaking it.
    let enrichment: DiscoveryEnrichment | undefined;
    if (clerkToken && clerkUserId) {
      try {
        const [scope, scores] = await Promise.all([
          resolveSeekerDiscoveryScope(clerkToken, clerkUserId),
          getMatchScoresForSeeker(clerkToken, clerkUserId),
        ]);
        enrichment = enrichmentFromScope(scope, scores);
      } catch {
        enrichment = undefined;
      }
    }

    const rows = await getLiveListingsWithCoords(
      clerkToken ?? undefined,
      clerkUserId ?? undefined,
    );
    return rows.map(
      (row) => rowToDiscoveryFields(row, enrichment) as DiscoveryListing,
    );
  } catch (error) {
    if (allowFixtureFallback) {
      reportDiscoveryFallback("getDiscoveryListingsWithCoords", error);
      return DISCOVERY_FIXTURES.filter((listing) => Boolean(listing.coordinates));
    }

    throw error;
  }
}

export function canUseDiscoveryFixtureFallback(): boolean {
  return !hasPublicDataConfig && allowFixtureFallback;
}

export function hasDiscoveryPublicDataConfig(): boolean {
  return hasPublicDataConfig;
}

export function warnIfDiscoveryDataMissingInProduction(context: string) {
  reportMissingProductionDiscoveryConfig(context);
}

/**
 * A page of swipe-deck listings plus the cursor for the next page.
 * `nextCursor` is the composite (published_at, id) keyset of the last row (see
 * encodeSwipeCursor — complete under tied timestamps), or null when the deck
 * is exhausted (the final page returned fewer than SWIPE_BATCH_SIZE rows).
 */
export interface SwipeBatch {
  readonly listings: DiscoveryListing[];
  readonly nextCursor: string | null;
}

/**
 * One page of the seeker's swipe deck: live listings newest-first, excluding
 * `excludeIds` (e.g. saved ids + cards already seen) and anything the seeker
 * has applied to (enforced inside getSwipeBatch). `clerkUserId` must come from
 * auth().userId.
 */
export async function getSwipeListings(
  clerkToken: string,
  clerkUserId: string,
  excludeIds: string[],
  cursor?: string,
): Promise<SwipeBatch> {
  // DEV MOCK BENCH: serve a fixture deck so /swipe renders without a real token.
  if (isDevBenchEnabled()) {
    return { listings: [...DISCOVERY_FIXTURES], nextCursor: null };
  }
  const rows = await getSwipeBatch(clerkToken, clerkUserId, excludeIds, cursor);
  // The cursor pages chronologically underneath (no repeats, stable paging);
  // the cursor must be taken from the FETCH order before any re-ranking. The
  // composite (published_at, id) keyset keeps rows sharing the boundary
  // timestamp from being skipped across page breaks.
  const lastRow = rows[rows.length - 1];
  const nextCursor =
    rows.length === SWIPE_BATCH_SIZE && lastRow ? encodeSwipeCursor(lastRow) : null;

  // Enrich with the SAME stored signals every other seeker surface uses: the
  // boosted marker + the persisted match % (read from the match_scores cache and
  // gated >= 75 inside rowToDiscoveryFields), so a swipe card shows the identical
  // number to /seek, the listing detail, and the lifecycle buckets — never a
  // per-render recompute. Order match-primary with boosted/enterprise as a bounded
  // lift (rankForSeeker). Best-effort: a scope fault serves the batch unenriched,
  // in chronological (fetch) order.
  let enrichment: DiscoveryEnrichment | undefined;
  try {
    const [scope, scores] = await Promise.all([
      resolveSeekerDiscoveryScope(clerkToken, clerkUserId),
      getMatchScoresForSeeker(clerkToken, clerkUserId),
    ]);
    enrichment = enrichmentFromScope(scope, scores);
  } catch {
    enrichment = undefined;
  }

  const cards = rows.map(
    (row) => rowToDiscoveryFields(row, enrichment) as DiscoveryListing,
  );

  const matchScores = enrichment?.matchScores;
  const listings = matchScores
    ? rankForSeeker(cards, (listing) => ({
        boosted: listing.conditionalBadges?.includes("boosted") ?? false,
        hostTier: listing.host.tier,
        matchScore: matchScores.get(listing.id),
        previouslySkipped: listing.previouslySkipped,
      }))
    : cards;

  return { listings, nextCursor };
}
