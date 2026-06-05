import { getPublicListings, getPublicListingById, rowToDiscoveryFields } from "@explore-and-earn/db";
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
export async function getDiscoveryListings(): Promise<DiscoveryListing[]> {
  const rows = await getPublicListings();
  return rows.map((row) => rowToDiscoveryFields(row) as DiscoveryListing);
}

/** A single live opportunity by id, or null when not found. */
export async function getDiscoveryListingById(
  id: string,
): Promise<DiscoveryListing | null> {
  const row = await getPublicListingById(id);
  if (!row) return null;
  return rowToDiscoveryFields(row) as DiscoveryListing;
}
