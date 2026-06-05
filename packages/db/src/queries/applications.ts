import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

export interface ApplyResult {
  readonly ok: boolean;
  readonly error?: string;
}

/** Postgres unique_violation SQLSTATE — surfaced as the already-applied case. */
const UNIQUE_VIOLATION = "23505";

/**
 * Decode the `sub` (Clerk user id) claim from a Clerk-issued JWT WITHOUT
 * verifying the signature. We only need the subject to scope the app-level
 * ownership guard (`WHERE clerk_user_id = $sub`). Authenticity of the token is
 * enforced by Supabase/PostgREST when the query is sent via authedClient(), and
 * by Clerk in the server action that mints the token.
 */
function clerkSubFromToken(token: string): string | null {
  const segments = token.split(".");
  if (segments.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    ) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Resolve seeker_profiles.id for the authed Clerk subject.
 *
 * TYPES BRIDGE: the committed packages/db/src/types.gen.ts predates migration
 * 009 (which added seeker_profiles.clerk_user_id), so a fully-typed
 * `.eq("clerk_user_id", ...)` does not compile. Until the generated types are
 * regenerated (requires DB access — see PR notes), this single lookup reads the
 * column through an UNTYPED view of the same authed client. The applications
 * insert/select below continue to use the fully-typed client.
 */
async function resolveSeekerProfileId(
  clerkToken: string,
  sub: string,
): Promise<string | null> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", sub)
    .maybeSingle();

  if (error) {
    throw new Error(`resolveSeekerProfileId: ${error.message}`);
  }
  return data ? (data.id as string) : null;
}

/**
 * Apply the authed seeker to a listing.
 *
 * App-level ownership guard only (RLS is gated to a separate change). Expected
 * business outcomes are returned as a typed result rather than thrown:
 * - `unauthenticated`  — token had no decodable subject
 * - `profile_not_found` — no seeker_profiles row yet (Clerk webhook pending)
 * - `already_applied`   — unique (listing_id, seeker_profile_id) violation
 */
export async function applyToListing(
  clerkToken: string,
  listingId: string,
  coverMessage?: string,
): Promise<ApplyResult> {
  const sub = clerkSubFromToken(clerkToken);
  if (!sub) {
    return { ok: false, error: "unauthenticated" };
  }

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, sub);
  if (!seekerProfileId) {
    return { ok: false, error: "profile_not_found" };
  }

  const { error } = await authedClient(clerkToken)
    .from("applications")
    .insert({
      listing_id: listingId,
      seeker_profile_id: seekerProfileId,
      cover_message: coverMessage ?? null,
    });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "already_applied" };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Listing ids the authed seeker has applied to (status != 'withdrawn').
 * Returns an empty array when the seeker has no profile yet or no applications.
 */
export async function getSeekerApplicationIds(
  clerkToken: string,
): Promise<string[]> {
  const sub = clerkSubFromToken(clerkToken);
  if (!sub) {
    return [];
  }

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, sub);
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
 * A seeker's own submitted application, shaped for the /applied lifecycle UI.
 * `status` stays a plain string here (the persisted lifecycle vocabulary is
 * broader than the local view-model union); the UI narrows it for display.
 */
export interface SeekerApplication {
  readonly id: string;
  readonly listingId: string;
  readonly status: string;
  /** ISO-8601 submission timestamp. */
  readonly submittedAt: string;
}

/**
 * Full application records for the authed seeker, newest first.
 *
 * `clerkUserId` must come from `auth().userId` (already verified by Clerk
 * middleware) — never decode it from the token. Same safe pattern as the
 * savedListings functions.
 *
 * Returns an empty array when the seeker has no profile yet or no applications.
 *
 * TYPES BRIDGE: `submitted_at` predates the committed types.gen.ts (same bridge
 * as resolveSeekerProfileId), so this read goes through an UNTYPED view of the
 * authed client until the generated types are regenerated.
 */
export async function getSeekerApplications(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerApplication[]> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("applications")
    .select("id, listing_id, status, submitted_at")
    .eq("seeker_profile_id", seekerProfileId)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`getSeekerApplications: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    listingId: row.listing_id as string,
    status: row.status as string,
    submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : "",
  }));
}
