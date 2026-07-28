import {
  HOMEPAGE_MIN_BOOSTED_THRESHOLD,
  type HomepageFeaturedEmployer,
} from "@explore-and-earn/db";

import type { DiscoveryListing } from "../components/discovery";
import { DISCOVERY_FIXTURES } from "../components/discovery";
import {
  canUseDiscoveryFixtureFallback,
  hasDiscoveryPublicDataConfig,
} from "../components/discovery/data";
import {
  getHomepageBoostedListingsCached,
  getHomepageFallbackListingsCached,
  getHomepageFeaturedEmployersCached,
} from "./serverCache";

/**
 * The public landing surfaces' shared inventory read.
 *
 * WHY THIS EXISTS. The homepage and the /for-seekers gateway both have to show
 * "some real opportunities", and both have to be honest when there are none.
 * Two copies of that resolution would drift within a release — one page would
 * keep a preview fallback the other dropped, and the marketplace would look
 * populated on one surface and empty on the next.
 *
 * THE HONESTY CONTRACT, in one place:
 *
 *   "live"    real published listings. Render them plainly; they are real.
 *   "example" stand-ins from the discovery fixtures. ONLY reachable outside a
 *             production build, and the caller MUST label them. A page that
 *             renders these without a visible "example" marker is lying.
 *   "empty"   there is genuinely nothing published. Say so; do not paper over
 *             it with fixtures. This is the branch production takes on an empty
 *             marketplace, and it is the correct one.
 *
 * The example branch is gated on the SAME predicate the homepage has always
 * used (no public Supabase config AND a non-production build), so a production
 * deployment cannot reach it whatever a caller passes.
 */
export type LandingInventorySource = "live" | "example" | "empty";

export interface LandingInventory {
  readonly listings: readonly DiscoveryListing[];
  readonly source: LandingInventorySource;
}

export async function getLandingListings(
  slots: number,
): Promise<LandingInventory> {
  const boosted = await getHomepageBoostedListingsCached(slots);
  if (boosted.length >= HOMEPAGE_MIN_BOOSTED_THRESHOLD) {
    return { listings: boosted.slice(0, slots) as DiscoveryListing[], source: "live" };
  }

  const fallback = await getHomepageFallbackListingsCached(slots);
  if (fallback.length > 0) {
    return { listings: fallback, source: "live" };
  }

  if (!hasDiscoveryPublicDataConfig() && canUseDiscoveryFixtureFallback()) {
    return { listings: DISCOVERY_FIXTURES.slice(0, slots), source: "example" };
  }

  // Preview-only visual fullness: a CONFIGURED but empty dev database still
  // renders a populated page, and it is still labelled as examples. Production
  // never takes this branch (NODE_ENV gate), so an empty marketplace shows the
  // empty state rather than inventory that does not exist.
  if (process.env.NODE_ENV !== "production") {
    return { listings: DISCOVERY_FIXTURES.slice(0, slots), source: "example" };
  }

  return { listings: [], source: "empty" };
}

/** The featured-employer campaigns behind the paid rails. */
export async function getLandingEmployers(
  slots: number,
): Promise<readonly HomepageFeaturedEmployer[]> {
  return getHomepageFeaturedEmployersCached(slots);
}
