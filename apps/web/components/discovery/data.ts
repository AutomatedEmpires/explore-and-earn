import { DISCOVERY_FIXTURES } from "./fixtures";
import type { DiscoveryListing } from "./listing";

/**
 * Discovery data-access boundary \u2014 the seeker lane's single fetch seam.
 *
 * Every seeker discovery surface (/seek, /swipe, /map, and \u2014 as they
 * migrate \u2014 the lifecycle buckets) reads opportunities through these
 * functions instead of importing DISCOVERY_FIXTURES directly. Today they
 * resolve the typed local fixtures; the Promise-returning signatures are
 * deliberate so that swapping to the real persisted Listing data layer
 * (Database V1) is a single-file change HERE \u2014 no surface, component, or
 * view-model rewrite required.
 *
 * When the canonical Listing contract + fetch land, replace the bodies below
 * (call the route-level API / data source and map the response into the
 * DiscoveryListing view-model). The exported function shapes are the contract
 * the UI depends on and must stay stable.
 *
 * A fresh array is returned so callers can never mutate the fixture source.
 */

/** All discoverable opportunities. Real data swaps in behind this function. */
export function getDiscoveryListings(): Promise<DiscoveryListing[]> {
  return Promise.resolve([...DISCOVERY_FIXTURES]);
}

/** A single opportunity by id, or null when it is not found. */
export function getDiscoveryListingById(
  id: string,
): Promise<DiscoveryListing | null> {
  return Promise.resolve(
    DISCOVERY_FIXTURES.find((listing) => listing.id === id) ?? null,
  );
}
