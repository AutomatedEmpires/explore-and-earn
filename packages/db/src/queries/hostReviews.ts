import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { anonClient, authedClient } from "../client";

/** Untyped anon client — types.gen does not yet carry host_reviews. */
function untypedAnon(): SupabaseClient {
  return anonClient() as unknown as SupabaseClient;
}

function untypedAuthed(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

/** Engagement statuses that mean the seeker actually worked there → can review. */
const REVIEWABLE_STATUSES = ["active", "completed"];

/**
 * Host reviews — the two-sided trust layer. Reads are PUBLIC (anon client), like
 * the listing search, so host reputation renders for everyone with no token.
 * Writes live in the seeker-scoped action (createHostReview below).
 */

export interface HostReview {
  readonly id: string;
  readonly rating: number;
  readonly housingAsDescribed: boolean | null;
  readonly mealsAsDescribed: boolean | null;
  readonly payOnTime: boolean | null;
  readonly body: string;
  readonly seekerDisplayName: string;
  readonly createdAt: string;
}

export interface HostRatingSummary {
  readonly count: number;
  /** Mean star rating (0 when no reviews). */
  readonly average: number;
  /** % of answering reviews that confirmed each promise (null = nobody answered). */
  readonly housingKeptPct: number | null;
  readonly mealsKeptPct: number | null;
  readonly payOnTimePct: number | null;
}

interface RawReviewRow {
  id: string;
  rating: number;
  housing_as_described: boolean | null;
  meals_as_described: boolean | null;
  pay_on_time: boolean | null;
  body: string;
  seeker_display_name: string;
  created_at: string;
}

/** % true among the rows that answered (non-null); null when nobody answered. */
function keptPct(rows: RawReviewRow[], key: keyof RawReviewRow): number | null {
  const answered = rows.filter((r) => r[key] !== null && r[key] !== undefined);
  if (answered.length === 0) return null;
  const kept = answered.filter((r) => r[key] === true).length;
  return Math.round((kept / answered.length) * 100);
}

export async function getHostRatingSummary(
  hostProfileId: string,
): Promise<HostRatingSummary> {
  const { data, error } = await untypedAnon()
    .from("host_reviews")
    .select("id, rating, housing_as_described, meals_as_described, pay_on_time, body, seeker_display_name, created_at")
    .eq("host_profile_id", hostProfileId);
  if (error || !data) {
    return {
      count: 0,
      average: 0,
      housingKeptPct: null,
      mealsKeptPct: null,
      payOnTimePct: null,
    };
  }
  const rows = data as RawReviewRow[];
  const count = rows.length;
  const average =
    count === 0
      ? 0
      : Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10;
  return {
    count,
    average,
    housingKeptPct: keptPct(rows, "housing_as_described"),
    mealsKeptPct: keptPct(rows, "meals_as_described"),
    payOnTimePct: keptPct(rows, "pay_on_time"),
  };
}

export async function getHostReviews(
  hostProfileId: string,
  limit = 8,
): Promise<HostReview[]> {
  const { data, error } = await untypedAnon()
    .from("host_reviews")
    .select("id, rating, housing_as_described, meals_as_described, pay_on_time, body, seeker_display_name, created_at")
    .eq("host_profile_id", hostProfileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as RawReviewRow[]).map((r) => ({
    id: r.id,
    rating: r.rating,
    housingAsDescribed: r.housing_as_described,
    mealsAsDescribed: r.meals_as_described,
    payOnTime: r.pay_on_time,
    body: r.body,
    seekerDisplayName: r.seeker_display_name,
    createdAt: r.created_at,
  }));
}

/* ── Write side: a seeker reviews a host after a real engagement ─────────────── */

export interface ReviewableEngagement {
  readonly applicationId: string;
  readonly seekerDisplayName: string;
}

/**
 * The seeker's reviewable engagement with this host — an active/completed
 * application for one of the host's listings that they haven't reviewed yet.
 * Returns null when the seeker isn't eligible (gates the "leave a review" UI).
 */
export async function getReviewableEngagementForHost(
  clerkToken: string,
  clerkUserId: string,
  hostProfileId: string,
): Promise<ReviewableEngagement | null> {
  try {
    const db = untypedAuthed(clerkToken);

    const { data: seeker } = await db
      .from("seeker_profiles")
      .select("id, display_name")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    const seekerRow = seeker as { id: string; display_name: string | null } | null;
    if (!seekerRow) return null;

    const { data: listings } = await db
      .from("listings")
      .select("id")
      .eq("host_profile_id", hostProfileId);
    const listingIds = ((listings ?? []) as Array<{ id: string }>).map((l) => l.id);
    if (listingIds.length === 0) return null;

    const { data: apps } = await db
      .from("applications")
      .select("id")
      .eq("seeker_profile_id", seekerRow.id)
      .in("listing_id", listingIds)
      .in("status", REVIEWABLE_STATUSES)
      .order("created_at", { ascending: false });
    const appRows = (apps ?? []) as Array<{ id: string }>;
    if (appRows.length === 0) return null;

    const { data: reviewed } = await db
      .from("host_reviews")
      .select("application_id")
      .in("application_id", appRows.map((a) => a.id));
    const reviewedSet = new Set(
      ((reviewed ?? []) as Array<{ application_id: string }>).map((r) => r.application_id),
    );
    const unreviewed = appRows.find((a) => !reviewedSet.has(a.id));
    if (!unreviewed) return null;

    return {
      applicationId: unreviewed.id,
      seekerDisplayName: seekerRow.display_name?.trim() || "A seeker",
    };
  } catch {
    return null;
  }
}

export interface HostReviewInput {
  readonly rating: number;
  readonly housingAsDescribed: boolean | null;
  readonly mealsAsDescribed: boolean | null;
  readonly payOnTime: boolean | null;
  readonly body: string;
}

export async function createHostReview(
  clerkToken: string,
  clerkUserId: string,
  hostProfileId: string,
  applicationId: string,
  input: HostReviewInput,
): Promise<{ ok: boolean }> {
  try {
    const db = untypedAuthed(clerkToken);

    const { data: seeker } = await db
      .from("seeker_profiles")
      .select("id, display_name")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    const seekerRow = seeker as { id: string; display_name: string | null } | null;
    if (!seekerRow) return { ok: false };

    // The application must be the seeker's own + reviewable.
    const { data: app } = await db
      .from("applications")
      .select("id, status, seeker_profile_id, listing_id")
      .eq("id", applicationId)
      .maybeSingle();
    const appRow = app as
      | { id: string; status: string; seeker_profile_id: string; listing_id: string }
      | null;
    if (
      !appRow ||
      appRow.seeker_profile_id !== seekerRow.id ||
      !REVIEWABLE_STATUSES.includes(appRow.status)
    ) {
      return { ok: false };
    }

    // IDOR guard: the engagement's listing must actually belong to this host.
    // Without it a seeker could pair a real engagement (host A) with an arbitrary
    // hostProfileId (host B) and review a host they never worked with. Derive the
    // host from the listing (source of truth) and reject any mismatch; the review
    // is written against the DERIVED host, never the caller-supplied value.
    const { data: listing } = await db
      .from("listings")
      .select("host_profile_id")
      .eq("id", appRow.listing_id)
      .maybeSingle();
    const listingHostId = (listing as { host_profile_id: string | null } | null)
      ?.host_profile_id;
    if (!listingHostId || listingHostId !== hostProfileId) {
      return { ok: false };
    }

    const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
    const { error } = await db.from("host_reviews").insert({
      host_profile_id: listingHostId,
      seeker_profile_id: seekerRow.id,
      application_id: applicationId,
      seeker_display_name: seekerRow.display_name?.trim() || "A seeker",
      rating,
      housing_as_described: input.housingAsDescribed,
      meals_as_described: input.mealsAsDescribed,
      pay_on_time: input.payOnTime,
      body: input.body.slice(0, 1000),
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
