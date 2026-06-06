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

/**
 * A single application as the HOST sees it: the application row joined up
 * through its listing to confirm host ownership, plus the applicant's Clerk id.
 */
export interface HostApplication {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly seekerProfileId: string;
  readonly seekerClerkUserId: string;
  readonly status: string;
  readonly coverMessage: string | null;
  readonly submittedAt: string;
}

/**
 * Embedded-join select string (the single-line pattern used in queries/listings.ts).
 * `!inner` is required on the listings -> host_profiles chain so that filtering on
 * host_profiles.clerk_user_id constrains the TOP-LEVEL application rows rather than
 * merely nulling the embed (which would leak other hosts' applications).
 */
const HOST_APPLICATIONS_SELECT =
  "id,listing_id,seeker_profile_id,status,cover_message,submitted_at,listings!listing_id!inner(title,host_profile_id,host_profiles!host_profile_id!inner(clerk_user_id)),seeker_profiles!seeker_profile_id(clerk_user_id)";

function firstOf(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

/**
 * All applications across the authed host's listings, newest first.
 *
 * Scoping is an app-level ownership guard (RLS for applications is gated to a
 * separate change): we constrain to host_profiles.clerk_user_id = $clerkUserId.
 * Uses the UNTYPED client cast (same pattern as resolveSeekerProfileId) because
 * the generated types predate the clerk_user_id columns.
 *
 * Primary path uses the PostgREST embedded join; if PostgREST rejects the embed
 * (named blocker in the build brief) we fall back to discrete queries.
 */
export async function getHostApplications(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostApplication[]> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  try {
    const { data, error } = await untyped
      .from("applications")
      .select(HOST_APPLICATIONS_SELECT)
      .eq("listings.host_profiles.clerk_user_id", clerkUserId)
      .order("submitted_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const listing = firstOf(r.listings);
      const seeker = firstOf(r.seeker_profiles);
      return {
        id: String(r.id),
        listingId: String(r.listing_id),
        listingTitle:
          listing && typeof listing.title === "string" ? listing.title : "",
        seekerProfileId: String(r.seeker_profile_id),
        seekerClerkUserId:
          seeker && typeof seeker.clerk_user_id === "string"
            ? seeker.clerk_user_id
            : "",
        status: typeof r.status === "string" ? r.status : "applied",
        coverMessage:
          typeof r.cover_message === "string" ? r.cover_message : null,
        submittedAt: String(r.submitted_at),
      } satisfies HostApplication;
    });
  } catch {
    return getHostApplicationsFallback(untyped, clerkUserId);
  }
}

/**
 * Discrete-query fallback for getHostApplications when the embedded join is
 * rejected: resolve host profile ids -> the host's listing ids/titles ->
 * applications on those listings -> applicant Clerk ids. Same app-level guard.
 */
async function getHostApplicationsFallback(
  untyped: SupabaseClient,
  clerkUserId: string,
): Promise<HostApplication[]> {
  const { data: hostRows, error: hostError } = await untyped
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId);
  if (hostError) {
    throw new Error(`getHostApplications(host_profiles): ${hostError.message}`);
  }
  const hostProfileIds = (hostRows ?? []).map((r) =>
    String((r as Record<string, unknown>).id),
  );
  if (hostProfileIds.length === 0) {
    return [];
  }

  const { data: listingRows, error: listingError } = await untyped
    .from("listings")
    .select("id,title")
    .in("host_profile_id", hostProfileIds);
  if (listingError) {
    throw new Error(`getHostApplications(listings): ${listingError.message}`);
  }
  const listingTitleById = new Map<string, string>();
  for (const raw of listingRows ?? []) {
    const r = raw as Record<string, unknown>;
    listingTitleById.set(
      String(r.id),
      typeof r.title === "string" ? r.title : "",
    );
  }
  const listingIds = [...listingTitleById.keys()];
  if (listingIds.length === 0) {
    return [];
  }

  const { data: appRows, error: appError } = await untyped
    .from("applications")
    .select("id,listing_id,seeker_profile_id,status,cover_message,submitted_at")
    .in("listing_id", listingIds)
    .order("submitted_at", { ascending: false });
  if (appError) {
    throw new Error(`getHostApplications(applications): ${appError.message}`);
  }
  const apps = (appRows ?? []).map((raw) => raw as Record<string, unknown>);

  const seekerProfileIds = [
    ...new Set(apps.map((r) => String(r.seeker_profile_id))),
  ];
  const seekerClerkById = new Map<string, string>();
  if (seekerProfileIds.length > 0) {
    const { data: seekerRows, error: seekerError } = await untyped
      .from("seeker_profiles")
      .select("id,clerk_user_id")
      .in("id", seekerProfileIds);
    if (seekerError) {
      throw new Error(
        `getHostApplications(seeker_profiles): ${seekerError.message}`,
      );
    }
    for (const raw of seekerRows ?? []) {
      const r = raw as Record<string, unknown>;
      seekerClerkById.set(
        String(r.id),
        typeof r.clerk_user_id === "string" ? r.clerk_user_id : "",
      );
    }
  }

  return apps.map((r) => ({
    id: String(r.id),
    listingId: String(r.listing_id),
    listingTitle: listingTitleById.get(String(r.listing_id)) ?? "",
    seekerProfileId: String(r.seeker_profile_id),
    seekerClerkUserId: seekerClerkById.get(String(r.seeker_profile_id)) ?? "",
    status: typeof r.status === "string" ? r.status : "applied",
    coverMessage: typeof r.cover_message === "string" ? r.cover_message : null,
    submittedAt: String(r.submitted_at),
  } satisfies HostApplication));
}

/**
 * Application counts keyed by listing id for the authed host, e.g.
 * { [listingId]: count }. Derived from getHostApplications so the ownership
 * guard and embed/fallback behaviour stay in one place.
 */
export async function getApplicationCountsByListing(
  clerkToken: string,
  clerkUserId: string,
): Promise<Record<string, number>> {
  const applications = await getHostApplications(clerkToken, clerkUserId);
  const counts: Record<string, number> = {};
  for (const application of applications) {
    counts[application.listingId] = (counts[application.listingId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Statuses a host is permitted to set on an application from the dashboard.
 * This is the host-facing decision vocabulary; seeker-facing values such as
 * 'applied' and 'withdrawn' are deliberately NOT settable here.
 */
const HOST_SETTABLE_STATUSES = [
  "reviewing",
  "saved_by_host",
  "offered",
  "not_selected",
] as const;

export type HostSettableStatus = (typeof HOST_SETTABLE_STATUSES)[number];

/**
 * Host changes the status of a single application.
 *
 * Ownership is enforced in application code (RLS for applications is gated to a
 * separate change), using the same discrete-query pattern as the
 * getHostApplications fallback: resolve the caller's host_profiles id(s), load
 * the target application's listing, and confirm that listing belongs to the
 * host before writing. `clerkUserId` MUST come from auth().userId (already
 * verified by Clerk) and is never decoded from the token.
 *
 * Business outcomes are returned as a typed result rather than thrown:
 * - `invalid_status` — newStatus is not a host-settable value
 * - `profile_not_found` — caller has no host_profiles row
 * - `not_found` — application does not exist
 * - `forbidden` — application's listing is not owned by the caller
 */
export async function updateApplicationStatus(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
  newStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(HOST_SETTABLE_STATUSES as readonly string[]).includes(newStatus)) {
    return { ok: false, error: "invalid_status" };
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  // 1. Resolve the caller's own host profile id(s).
  const { data: hostRows, error: hostError } = await untyped
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId);
  if (hostError) {
    return { ok: false, error: hostError.message };
  }
  const hostProfileIds = new Set(
    (hostRows ?? []).map((r) => String((r as Record<string, unknown>).id)),
  );
  if (hostProfileIds.size === 0) {
    return { ok: false, error: "profile_not_found" };
  }

  // 2. Load the target application's listing.
  const { data: appRow, error: appError } = await untyped
    .from("applications")
    .select("id,listing_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) {
    return { ok: false, error: appError.message };
  }
  if (!appRow) {
    return { ok: false, error: "not_found" };
  }

  // 3. Confirm that listing belongs to one of the caller's host profiles.
  const listingId = String((appRow as Record<string, unknown>).listing_id);
  const { data: listingRow, error: listingError } = await untyped
    .from("listings")
    .select("id,host_profile_id")
    .eq("id", listingId)
    .maybeSingle();
  if (listingError) {
    return { ok: false, error: listingError.message };
  }
  if (
    !listingRow ||
    !hostProfileIds.has(
      String((listingRow as Record<string, unknown>).host_profile_id),
    )
  ) {
    return { ok: false, error: "forbidden" };
  }

  // 4. Apply the status change.
  const { error: updateError } = await untyped
    .from("applications")
    .update({ status: newStatus })
    .eq("id", applicationId);
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true };
}
