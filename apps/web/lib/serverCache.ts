import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import {
  getHostProfile,
  getListingDetailPublic,
  getPublicHostProfile,
  getPublicListings,
  getSeekerProfile,
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
 * Request-scoped Supabase JWT. Clerk mints a fresh token per `getToken()` call
 * (a network round-trip, and each token differs by `iat`), so calling it once
 * per request and reusing the result is both faster AND makes the token string
 * stable — which is what lets {@link cachedSeekerProfile} / {@link cachedHostProfile}
 * dedupe across the layout↔page boundary.
 */
export const getSupabaseToken = cache(async (): Promise<string | null> => {
  const { getToken } = await auth();
  return (await getToken({ template: "supabase" })) ?? null;
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
