import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Host-profile data access for the host onboarding / management experience.
 *
 * SECURITY: Row Level Security is NOT yet enabled on `host_profiles`, and
 * `authedClient()` talks to PostgREST with the anon key plus the caller's Clerk
 * JWT (the `anon` role, which performs no row-level enforcement). Every query in
 * this module is therefore scoped in application code by the caller-supplied,
 * already-verified `clerkUserId` (from `auth().userId`) — never decode it from
 * the token. Keep these manual scoping filters even once RLS lands; they are
 * defense in depth.
 *
 * TYPES: `host_profiles` is now present in the generated
 * `packages/db/src/types.gen.ts`, but `createHostProfile` below inserts only
 * `clerk_user_id` / `company_name` / `attestation_status`, while the generated
 * `Insert` type marks `owner_user_id` and `slug` as required. A typed client
 * would reject that insert, and "fixing" it would mean supplying those columns
 * (a runtime behavior change) rather than a pure type fix. We therefore keep an
 * untyped `SupabaseClient` handle for `.from(...)` calls and narrow returned
 * rows locally, mirroring `savedListings.ts`.
 * // types not yet generated: host_profiles insert omits required owner_user_id/slug
 */

const PENDING_ATTESTATION = "pending" as const;

/** Postgres unique_violation SQLSTATE (host_profiles.clerk_user_id is UNIQUE). */
const UNIQUE_VIOLATION = "23505";

/** Untyped Supabase handle (see TYPES note above). */
function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

/**
 * Resolve the caller's own `host_profiles.id` from their Clerk user id.
 * Returns `null` when the user has not created a host profile yet.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken()`.
 * @param clerkUserId - Verified Clerk user ID from `auth().userId` — do NOT
 *   decode this from the token; pass it from the already-verified `auth()` call.
 */
export async function getHostProfile(
  clerkToken: string,
  clerkUserId: string,
): Promise<{ id: string } | null> {
  const db = untypedClient(clerkToken);
  const { data, error } = await db
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) {
    throw new Error(`getHostProfile: ${error.message}`);
  }
  return data ? { id: (data as { id: string }).id } : null;
}

/**
 * Create a `host_profiles` row for the caller and return its new id.
 *
 * Resilient to double-submit: because `clerk_user_id` is UNIQUE, a duplicate
 * insert surfaces as a unique violation; we re-resolve the existing row and
 * return it as `{ ok: true }` rather than failing the user. Other errors return
 * `{ ok: false }`.
 */
export async function createHostProfile(
  clerkToken: string,
  clerkUserId: string,
  companyName: string,
): Promise<{ ok: boolean; id?: string }> {
  const db = untypedClient(clerkToken);
  const { data, error } = await db
    .from("host_profiles")
    .insert({
      clerk_user_id: clerkUserId,
      company_name: companyName,
      attestation_status: PENDING_ATTESTATION,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const existing = await getHostProfile(clerkToken, clerkUserId);
      return existing ? { ok: true, id: existing.id } : { ok: false };
    }
    return { ok: false };
  }

  return { ok: true, id: (data as { id: string }).id };
}
