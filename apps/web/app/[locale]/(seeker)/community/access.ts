import { auth } from "@clerk/nextjs/server";
import { getHostTierAndProfile } from "@explore-and-earn/db";

import { cachedSeekerProfile, getSupabaseToken } from "../../../../lib/serverCache";
import { isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";

/**
 * Community access resolution (V2 D18).
 *
 * WHAT CHANGED. Community used to be a role-neutral destination in the public
 * header. It is now an authenticated SEEKER space, which needs three distinct
 * answers, not two:
 *
 *   signed_out            → the middleware already redirected; this is the
 *                           in-process backstop for anything that reaches a
 *                           layout without passing the matcher.
 *   needs_seeker_profile  → SIGNED IN, but has no seeker_profiles row. This is
 *                           the case D18 calls out by name: a HOST who follows
 *                           a Community link must be offered the choice to join
 *                           as a seeker. It must never be converted silently.
 *   ok                    → a seeker profile exists; render the space.
 *
 * NOTHING HERE MUTATES. There is no ensure_my_seeker_profile call, no upsert,
 * no "create on first visit" — reading someone's absence from a table is not
 * permission to add them to it. The database agrees (migration 073 grants
 * ensure_my_seeker_profile to `authenticated` only, and the authorization
 * matrix asserts anon cannot execute it), but the DB refusing an anonymous
 * write is not the same as the product not attempting one, and the product must
 * not attempt one. The gate below is READ-ONLY by construction.
 *
 * ONBOARDING IS NOT DECIDED HERE. A row that exists with onboarding_complete
 * false is already redirected to /onboarding by the (seeker) layout above this
 * one; duplicating that decision would give the same fact two owners.
 */

export type CommunityAccess =
  | { readonly state: "signed_out" }
  | { readonly state: "needs_seeker_profile"; readonly isHost: boolean }
  | { readonly state: "ok" };

export async function resolveCommunityAccess(): Promise<CommunityAccess> {
  // DEV MOCK BENCH (review tooling only): an impersonated role must be able to
  // walk this surface without a Clerk session or a real profile row. No-op in
  // production/preview — isDevBenchEnabled() is false in any prod build.
  if (isDevBenchEnabled() && (await readDevRole())) {
    return { state: "ok" };
  }

  // FAILS CLOSED. auth() throws rather than returning null when it cannot see
  // clerkMiddleware — a keyless local bench, a matcher misconfiguration. An
  // unhandled throw here is a 500 on a page whose correct answer in that state
  // is "we do not know who you are", which is signed_out.
  const userId = await auth()
    .then((session) => session.userId)
    .catch(() => null);
  if (!userId) return { state: "signed_out" };

  const token = await getSupabaseToken().catch(() => null);
  // No token for a signed-in user means the session could not be exchanged, not
  // that the person lacks a profile. FAIL TOWARD THE CHOICE SCREEN rather than
  // toward the feed: showing the join gate to an existing seeker is a wasted
  // click, whereas rendering the space for someone we could not identify would
  // be the actual defect.
  if (!token) return { state: "needs_seeker_profile", isHost: false };

  const [profile, host] = await Promise.all([
    cachedSeekerProfile(token, userId).catch(() => null),
    getHostTierAndProfile(token, userId).catch(() => null),
  ]);

  if (profile) return { state: "ok" };
  return { state: "needs_seeker_profile", isHost: host !== null };
}
