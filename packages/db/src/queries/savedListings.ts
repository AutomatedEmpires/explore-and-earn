import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Saved-listings data access for the seeker swipe / saved experience.
 *
 * SECURITY: Row Level Security is NOT yet enabled on `saved_listings`, and
 * `authedClient()` talks to PostgREST with the anon key plus the caller's Clerk
 * JWT (the `anon` role, which performs no row-level enforcement). Every query in
 * this module is therefore scoped in application code by the `seeker_profile_id`
 * we resolve from the verified JWT `sub` (== `clerk_user_id`). Keep these manual
 * scoping filters even once RLS lands; they are defense in depth.
 *
 * TYPES: `packages/db/src/types.gen.ts` is still a placeholder
 * (`GeneratedDatabase = Record<string, never>`), so the typed client cannot
 * describe these tables yet. We cast to an untyped `SupabaseClient` handle for
 * `.from(...)` calls and narrow the returned rows locally. Drop the cast once
 * generated types exist.
 */

const SAVED_STATUS = "saved" as const;
const REMOVED_STATUS = "removed" as const;

/** Decode the `sub` (Clerk user id) claim from a Clerk JWT without verifying it. */
function decodeClerkSub(clerkToken: string): string {
  const parts = clerkToken.split(".");
  if (parts.length < 2 || !parts[1]) {
    throw new Error("Malformed Clerk JWT: cannot read the `sub` claim.");
  }
  let payload: { sub?: unknown };
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: unknown;
    };
  } catch {
    throw new Error("Malformed Clerk JWT payload: not valid JSON.");
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Clerk JWT is missing a `sub` claim.");
  }
  return payload.sub;
}

/** Untyped Supabase handle (see TYPES note above). */
function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

/**
 * Resolve the caller's own `seeker_profiles.id` from their Clerk user id.
 * Returns `null` when the seeker has not created a profile row yet.
 */
async function resolveSeekerProfileId(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("seeker_profiles")
    .select("id, clerk_user_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) {
    throw new Error(`resolveSeekerProfileId: ${error.message}`);
  }
  return data ? (data as { id: string }).id : null;
}

/**
 * Save (or re-save) a listing for the current seeker by upserting a
 * `saved_listings` row with `status='saved'`.
 *
 * Best-effort by design: returns `{ ok: false }` silently when the seeker has no
 * profile yet or the write fails, so the swipe UX is never blocked. Never throws.
 */
export async function saveListing(
  clerkToken: string,
  listingId: string,
): Promise<{ ok: boolean }> {
  try {
    const sub = decodeClerkSub(clerkToken);
    const db = untypedClient(clerkToken);
    const seekerProfileId = await resolveSeekerProfileId(db, sub);
    if (!seekerProfileId) {
      return { ok: false };
    }

    const { error } = await db.from("saved_listings").upsert(
      {
        seeker_profile_id: seekerProfileId,
        listing_id: listingId,
        status: SAVED_STATUS,
      },
      { onConflict: "seeker_profile_id,listing_id" },
    );
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * Mark a previously saved listing as removed (`status='removed'`) for the current
 * seeker. Best-effort: returns `{ ok: false }` silently on any failure and never
 * throws.
 */
export async function unsaveListing(
  clerkToken: string,
  listingId: string,
): Promise<{ ok: boolean }> {
  try {
    const sub = decodeClerkSub(clerkToken);
    const db = untypedClient(clerkToken);
    const seekerProfileId = await resolveSeekerProfileId(db, sub);
    if (!seekerProfileId) {
      return { ok: false };
    }

    const { error } = await db
      .from("saved_listings")
      .update({ status: REMOVED_STATUS })
      .eq("seeker_profile_id", seekerProfileId)
      .eq("listing_id", listingId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * Return the `listing_id`s the current seeker has actively saved
 * (`status='saved'`), newest first. Returns an empty array when the seeker has
 * no profile yet or has saved nothing.
 */
export async function getSavedListingIds(
  clerkToken: string,
): Promise<string[]> {
  const sub = decodeClerkSub(clerkToken);
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerProfileId(db, sub);
  if (!seekerProfileId) {
    return [];
  }

  const { data, error } = await db
    .from("saved_listings")
    .select("listing_id, created_at")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("status", SAVED_STATUS)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`getSavedListingIds: ${error.message}`);
  }

  return ((data ?? []) as Array<{ listing_id: string }>).map(
    (row) => row.listing_id,
  );
}
