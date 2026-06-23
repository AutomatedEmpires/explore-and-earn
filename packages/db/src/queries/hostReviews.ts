import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { anonClient } from "../client";

/** Untyped anon client — types.gen does not yet carry host_reviews. */
function untypedAnon(): SupabaseClient {
  return anonClient() as unknown as SupabaseClient;
}

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
