import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { anonClient, authedClient } from "../client";

/**
 * Neutral home for the two per-request "id set" readers that both the listing
 * discovery path (listings.ts) and the application path (applications.ts) need.
 *
 * WHY THIS FILE EXISTS: listings.ts needs the seeker's applied ids (to
 * HARD-exclude applied listings) and applications.ts needs the active-boost ids
 * (to stamp the boosted marker on lifecycle cards). Keeping the readers in
 * either query module created a listings.ts <-> applications.ts import CYCLE.
 * Extracting them here — a leaf module that imports only the Supabase clients —
 * lets both modules depend on this one and on nothing of each other's.
 *
 * Behavior is byte-for-byte identical to the prior in-place definitions; only
 * the file boundary moved.
 */

/**
 * Resolve seeker_profiles.id for the authed Clerk user.
 *
 * `clerkUserId` MUST come from `auth().userId` — never decode it from the token.
 * Private to this module (each query module keeps its own thin copy); shared
 * here only because both readers below need it.
 */
async function resolveSeekerProfileId(
  clerkToken: string,
  clerkUserId: string,
): Promise<string | null> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`resolveSeekerProfileId: ${error.message}`);
  }
  return data ? (data.id as string) : null;
}

/**
 * Listing ids the authed seeker has a NON-withdrawn application to. Powers the
 * applied HARD-exclusion across every seeker surface (seek / map / swipe) and
 * the discovery-scope resolution. Withdrawn rows are intentionally skipped so a
 * re-apply is still possible (migration 063). Returns [] when the seeker has no
 * profile yet.
 */
export async function getSeekerApplicationIds(
  clerkToken: string,
  clerkUserId: string,
): Promise<string[]> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }

  const { data, error } = await authedClient(clerkToken)
    .from("applications")
    .select("listing_id")
    .eq("seeker_profile_id", seekerProfileId)
    .neq("status", "withdrawn");

  if (error) {
    throw new Error(`getSeekerApplicationIds: ${error.message}`);
  }

  return (data ?? []).map((row) => row.listing_id);
}

/**
 * The set of listing ids that currently have an ACTIVE boost campaign, resolved
 * ONCE per request so the boosted marker can be stamped on every card/surface
 * (not just the homepage — founder decision). "Active" = status='active' and
 * now within [starts_at, ends_at], across ALL surfaces (a boost shows its marker
 * wherever the listing appears).
 *
 * Defensive by design: returns an empty set on any fault (missing Supabase
 * config, pre-029 schema, RLS/permission error) so discovery degrades to
 * "no boosts" rather than throwing. Boost status is public data (the marker is
 * shown to everyone), so this reads via the anon client unless a token is given.
 */
export async function getActiveBoostedListingIds(
  clerkToken?: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const configured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!configured) return ids;

  try {
    const db = (
      clerkToken ? authedClient(clerkToken) : anonClient()
    ) as unknown as SupabaseClient;
    const now = new Date().toISOString();
    const { data, error } = await db
      .from("listing_boost_campaigns")
      .select("listing_id")
      .eq("status", "active")
      .lte("starts_at", now)
      .gte("ends_at", now);
    if (error || !data) return ids;
    for (const raw of data as Array<{ listing_id: string | null }>) {
      if (raw.listing_id) ids.add(String(raw.listing_id));
    }
  } catch {
    // Pre-029 schema or permission fault — degrade to no boosts.
  }
  return ids;
}
