import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Swipe-pass persistence (migration 057). A pass is a real preference
 * signal: it keeps the card out of future decks and is the demotion input
 * for future ranking work. RLS is owner-scoped (insert/select/delete own);
 * every query additionally scopes by the seeker_profile_id resolved from the
 * verified clerkUserId — same defense-in-depth as saved_listings.
 */

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

async function resolveSeekerProfileId(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) {
    throw new Error(`resolveSeekerProfileId: ${error.message}`);
  }
  return data ? (data as { id: string }).id : null;
}

/** Record a pass (idempotent — repeat passes upsert onto the PK pair). */
export async function passListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<{ ok: boolean }> {
  try {
    const db = untypedClient(clerkToken);
    const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
    if (!seekerProfileId) {
      return { ok: false };
    }
    const { error } = await db.from("listing_passes").upsert(
      { seeker_profile_id: seekerProfileId, listing_id: listingId },
      { onConflict: "seeker_profile_id,listing_id" },
    );
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/** Remove a pass — the deck's Undo. */
export async function unpassListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<{ ok: boolean }> {
  try {
    const db = untypedClient(clerkToken);
    const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
    if (!seekerProfileId) {
      return { ok: false };
    }
    const { error } = await db
      .from("listing_passes")
      .delete()
      .eq("seeker_profile_id", seekerProfileId)
      .eq("listing_id", listingId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/** Every listing this seeker has passed on (deck exclusion input). */
export async function getPassedListingIds(
  clerkToken: string,
  clerkUserId: string,
): Promise<string[]> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }
  const { data, error } = await db
    .from("listing_passes")
    .select("listing_id")
    .eq("seeker_profile_id", seekerProfileId);
  if (error) {
    throw new Error(`getPassedListingIds: ${error.message}`);
  }
  return ((data ?? []) as Array<{ listing_id: string }>).map((r) => r.listing_id);
}
