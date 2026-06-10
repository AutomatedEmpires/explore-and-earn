import {
  getLiveListingsWithCoords,
  getPublicListings,
  getPublicListingById,
  getSwipeBatch,
  rowToDiscoveryFields,
  SWIPE_BATCH_SIZE,
} from "@explore-and-earn/db";
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

/** All discoverable live opportunities. */
const hasPublicDataConfig =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function getDiscoveryListings(): Promise<DiscoveryListing[]> {
  if (!hasPublicDataConfig) {
    return [...DISCOVERY_FIXTURES];
  }

  const rows = await getPublicListings();
  return rows.map((row) => rowToDiscoveryFields(row) as DiscoveryListing);
}

/** A single live opportunity by id, or null when not found. */
export async function getDiscoveryListingById(
  id: string,
): Promise<DiscoveryListing | null> {
  if (!hasPublicDataConfig) {
    return DISCOVERY_FIXTURES.find((listing) => listing.id === id) ?? null;
  }

  const row = await getPublicListingById(id);
  if (!row) return null;
  return rowToDiscoveryFields(row) as DiscoveryListing;
}

/** Live opportunities that carry coordinates — backs the /map surface. */
export async function getDiscoveryListingsWithCoords(): Promise<
  DiscoveryListing[]
> {
  if (!hasPublicDataConfig) {
    return DISCOVERY_FIXTURES.filter(
      (listing): listing is DiscoveryListing => Boolean(listing.coordinates),
    );
  }

  const rows = await getLiveListingsWithCoords();
  return rows.map((row) => rowToDiscoveryFields(row) as DiscoveryListing);
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
  const rows = await getSwipeBatch(clerkToken, clerkUserId, excludeIds, cursor);
  const listings = rows.map(
    (row) => rowToDiscoveryFields(row) as DiscoveryListing,
  );
  const nextCursor =
    rows.length === SWIPE_BATCH_SIZE
      ? rows[rows.length - 1]?.published_at ?? null
      : null;
  return { listings, nextCursor };
}
