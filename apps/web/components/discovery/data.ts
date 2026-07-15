import {
  getLiveListingsWithCoords,
  getPublicListingById,
  getSwipeBatch,
  rowToDiscoveryFields,
  scoreSeekerListingRow,
  seekerHasMatchInputs,
  SWIPE_BATCH_SIZE,
} from "@explore-and-earn/db";
import { matchBandFor } from "@explore-and-earn/contracts";
import { cachedSeekerProfile, getPublicListingsCached } from "../../lib/serverCache";
import { DEV_USER_ID, isDevBenchEnabled } from "../../lib/devBench";
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

/** Live opportunities that carry coordinates — backs the /map surface. */
export async function getDiscoveryListingsWithCoords(): Promise<
  DiscoveryListing[]
> {
  // DEV MOCK BENCH: deterministic fixtures over live data while impersonating.
  if (isDevBenchEnabled()) {
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
    const rows = await getLiveListingsWithCoords();
    return rows.map((row) => rowToDiscoveryFields(row) as DiscoveryListing);
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
 * `nextCursor` is the published_at of the last row, or null when the deck is
 * exhausted (the final page returned fewer than SWIPE_BATCH_SIZE rows).
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
  if (isDevBenchEnabled() && clerkUserId === DEV_USER_ID) {
    return { listings: [...DISCOVERY_FIXTURES], nextCursor: null };
  }
  const rows = await getSwipeBatch(clerkToken, clerkUserId, excludeIds, cursor);
  // The cursor pages chronologically underneath (no repeats, stable paging);
  // the cursor must be taken from the FETCH order before any re-ranking.
  const nextCursor =
    rows.length === SWIPE_BATCH_SIZE
      ? rows[rows.length - 1]?.published_at ?? null
      : null;

  // ADR-040: the deck leads with the seeker's best fits. Scored with the SAME
  // engine the /seek grid and listing detail use (scoreSeekerListingRow), and
  // stamped under the same honest gate (developing+ bands only). Fit is an
  // enhancement — any failure serves the batch chronologically, unscored.
  let ordered = rows;
  const scores = new Map<string, number>();
  try {
    const profile = await cachedSeekerProfile(clerkToken, clerkUserId);
    if (profile && seekerHasMatchInputs(profile)) {
      for (const row of rows) {
        scores.set(row.id, scoreSeekerListingRow(profile, row));
      }
      ordered = [...rows].sort(
        (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0),
      );
    }
  } catch {
    // Profile read failed — the deck still works without fit intelligence.
  }

  const listings = ordered.map((row) => {
    const listing = rowToDiscoveryFields(row) as DiscoveryListing;
    const score = scores.get(row.id);
    return score !== undefined && matchBandFor(score) !== "needs_attention"
      ? { ...listing, matchScore: score }
      : listing;
  });
  return { listings, nextCursor };
}
