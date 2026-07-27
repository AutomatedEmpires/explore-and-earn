import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import {
  getHomepageBoostedListings,
  getHomepageFallbackListings,
  getHomepageFeaturedEmployers,
  getHostProfile,
  getHostSubscriptionByClerkUserId,
  hostAccountState,
  type HostAccountState,
  getListingDetailPublic,
  getPublicHostProfile,
  getPublicListings,
  getSeekerProfile,
  searchListings,
} from "@explore-and-earn/db";

/**
 * Server-render caching seam for `apps/web`.
 *
 * Two distinct caching layers live here — kept in the app, NOT in
 * `packages/db`, so the db package stays framework-agnostic (it is also
 * consumed by the mailer, scripts, and tests that have no Next runtime):
 *
 *  1. REQUEST-SCOPED memoization via React `cache()` — dedupes work that a
 *     layout and its child page (and that page's helpers) would otherwise
 *     repeat within a SINGLE server request: minting the Supabase JWT and
 *     loading the authed profile. Before this, a single seeker navigation
 *     minted the Clerk token 2–3× (a network round-trip each) and re-queried
 *     `seeker_profiles` 4–5×.
 *
 *  2. CROSS-REQUEST caching via `unstable_cache` — the public, non-personalized
 *     reads (anon-client listing + host data) are served from the Next data
 *     cache for `revalidate` seconds instead of hitting Postgres on every
 *     visit. These take no auth token, so caching them shares nothing between
 *     users. Tag-based invalidation lets the mutating server actions bust the
 *     cache immediately on publish/edit.
 */

/**
 * Request-scoped Clerk session JWT from the native Supabase integration.
 * (a network round-trip, and each token differs by `iat`), so calling it once
 * per request and reusing the result is both faster AND makes the token string
 * stable — which is what lets {@link cachedSeekerProfile} / {@link cachedHostProfile}
 * dedupe across the layout↔page boundary.
 */
export const getSupabaseToken = cache(async (): Promise<string | null> => {
  const { getToken } = await auth();
  return (await getToken()) ?? null;
});

/**
 * Request-scoped authed seeker profile. Keyed on (token, clerkUserId); with the
 * shared {@link getSupabaseToken} the token is identical across callers, so the
 * layout's onboarding gate and the page's data both resolve from one query.
 */
export const cachedSeekerProfile = cache(
  (token: string, clerkUserId: string) => getSeekerProfile(token, clerkUserId),
);

/** Request-scoped authed host profile — same rationale as the seeker variant. */
export const cachedHostProfile = cache(
  (token: string, clerkUserId: string) => getHostProfile(token, clerkUserId),
);

/**
 * Request-scoped host billing state, for COPY DECISIONS ONLY.
 *
 * Commercial redesign D6 created a host who has a workspace and no plan. Telling
 * that host something useful, and telling a host whose card merely failed
 * something different, needs `billing_status` — which lives on
 * public.host_subscriptions and not on the denormalized
 * host_profiles.subscription_tier the layout already holds. Hence a second read,
 * memoized per request so the (host) layout and a page beneath it share one.
 *
 * RETURNS `null` WHEN THE AUTHORITY COULD NOT BE CONSULTED, and that is not the
 * same value as `prospect`. getHostSubscriptionByClerkUserId throws rather than
 * returning null on a read failure, precisely so callers can tell "no
 * subscription" from "no answer"; flattening the two here would put an
 * activation banner in front of a paying host every time Postgres hiccupped. A
 * missing banner is a missed nudge; a wrong one is an insult to a customer.
 *
 * NOT A GATE. Every refusal that matters is the database's — see
 * hostAccountState's own header.
 */
export const cachedHostAccountState = cache(
  async (clerkUserId: string): Promise<HostAccountState | null> => {
    try {
      return hostAccountState(await getHostSubscriptionByClerkUserId(clerkUserId));
    } catch {
      return null;
    }
  },
);

/**
 * How long public discovery data may be served stale from the Next data cache.
 * 60s is imperceptible for browsing and collapses per-request Postgres load on
 * the hottest routes; mutations bust the relevant tag immediately regardless.
 */
const PUBLIC_REVALIDATE_SECONDS = 60;

/** Cache tag busted whenever a listing is published, edited, or expires. */
export const LISTINGS_CACHE_TAG = "public-listings";
/** Cache tag busted whenever a host profile changes. */
export const HOST_PROFILES_CACHE_TAG = "public-host-profiles";

/** Public live-listings feed (anon) — cached across requests. */
export const getPublicListingsCached = unstable_cache(
  (limit?: number) => getPublicListings(limit),
  ["public-listings-feed"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [LISTINGS_CACHE_TAG] },
);

/** Public single-listing detail (anon) — cached per listing id across requests. */
export const getListingDetailPublicCached = unstable_cache(
  (listingId: string) => getListingDetailPublic(listingId),
  ["public-listing-detail"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [LISTINGS_CACHE_TAG] },
);

/** Public host profile (anon) — cached per host id across requests. */
export const getPublicHostProfileCached = unstable_cache(
  (hostProfileId: string) => getPublicHostProfile(hostProfileId),
  ["public-host-profile"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [HOST_PROFILES_CACHE_TAG] },
);

/**
 * Homepage anon reads (review 2026-07-22) — the most-hit URL previously ran
 * its 3–4 query Supabase chain uncached on EVERY request while /seek,
 * /listing/[id] and /host/[id] already sat behind this seam. Same policy:
 * 60s revalidate, listing-tag busting on publish/edit. Boost-campaign
 * activations (Stripe webhook / admin) go at most 60s stale — accepted, same
 * as every other paid-placement read on the cached surfaces.
 */
export const getHomepageBoostedListingsCached = unstable_cache(
  (limit: number) => getHomepageBoostedListings(limit),
  ["homepage-boosted-listings"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    // Both tags: the query joins host_profiles (tier/verification), so a host
    // profile change must bust this too (review 2026-07-22).
    tags: [LISTINGS_CACHE_TAG, HOST_PROFILES_CACHE_TAG],
  },
);

/** Homepage featured-employer rail (anon) — reads listings AND host profiles. */
export const getHomepageFeaturedEmployersCached = unstable_cache(
  (limit: number) => getHomepageFeaturedEmployers(limit),
  ["homepage-featured-employers"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [LISTINGS_CACHE_TAG, HOST_PROFILES_CACHE_TAG],
  },
);

/** Homepage fallback feed when boosted inventory is under threshold (anon). */
export const getHomepageFallbackListingsCached = unstable_cache(
  (limit: number) => getHomepageFallbackListings(limit),
  ["homepage-fallback-listings"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    // Both tags — same host_profiles join as the boosted query above.
    tags: [LISTINGS_CACHE_TAG, HOST_PROFILES_CACHE_TAG],
  },
);

/**
 * Category landing-page feed (anon) — /jobs/{lane}. unstable_cache keys on the
 * args, so one wrapper serves all four lanes. searchListings joins
 * host_profiles (subscription_tier for the monetization ranking), hence both
 * tags. Anonymous + live-only by construction.
 */
export const getCategoryListingsCached = unstable_cache(
  (category: string, limit: number) =>
    searchListings({ categories: [category], limit }),
  ["public-category-listings"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [LISTINGS_CACHE_TAG, HOST_PROFILES_CACHE_TAG],
  },
);
