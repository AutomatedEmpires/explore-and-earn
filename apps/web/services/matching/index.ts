import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  computeMatch,
  type MatchListingInput,
  type MatchSeekerInput,
} from "@explore-and-earn/db";
import type { MatchBand, MatchCap, MatchComponentScores } from "@explore-and-earn/contracts";

/**
 * Matching service — computes and persists ADR-040 match scores.
 *
 * Isolation (ADR-007 / G8, enforced by tools/scripts/check-match-isolation.mjs):
 * match score reflects FIT only, and this module imports no monetization/exposure
 * modules. Money affects exposure elsewhere in discovery ranking, never here.
 *
 * The pure engine lives in @explore-and-earn/db (computeMatch). This layer only
 * loads rows, maps them onto the engine's inputs, and upserts the numeric result
 * into match_scores (G34: numbers only — no explanation text is stored). New
 * typed match columns (migration 051) are read defensively via select("*") so
 * this service is resilient to pre/post-migration state.
 */

// Service-role handle; cast to untyped so newly-added columns (before types.gen
// is regenerated) are readable — the established convention in packages/db.
function db(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

type Row = Record<string, unknown>;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const asNumber = (value: unknown): number | null =>
  typeof value === "number" ? value : null;
const asBool = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

function toSeekerInput(row: Row): MatchSeekerInput {
  return {
    desiredCategories: asStringArray(row.desired_categories),
    desiredRoles: asStringArray(row.desired_roles),
    skillTags: asStringArray(row.general_skill_tags),
    certifications: [], // sourced from seeker_certifications in a later pass
    interestTags: asStringArray(row.interest_tags),
    experienceLevel: asString(row.experience_level),
    housingPreference: asString(row.housing_preference),
    mealsPreference: asString(row.meals_preference),
    locationPref: asString(row.location_pref),
    remotePreference: asString(row.remote_preference),
    travelReadiness: asString(row.travel_readiness),
    payExpectationMinCents: asNumber(row.pay_expectation_min_cents),
    payFlexible: asBool(row.pay_flexible),
    availabilityStart: asString(row.availability_start),
    availabilityEnd: asString(row.availability_end),
    availabilityStatus: asString(row.availability_status),
    visaSupportNeeded: asBool(row.visa_support_needed) ?? false,
    completionScore: asNumber(row.completion_score),
  };
}

function toListingInput(row: Row): MatchListingInput {
  return {
    category: asString(row.category),
    tags: asStringArray(row.tags),
    roles: asStringArray(row.mix_domains),
    requiredSkillTags: asStringArray(row.required_skill_tags),
    requiredCertifications: asStringArray(row.required_certifications),
    experienceLevelRequired: asString(row.experience_level_required),
    seasonality: asStringArray(row.seasonality),
    isRemote: asBool(row.is_remote),
    locationDisplay: asString(row.location_display),
    housingIncluded: asBool(row.housing_included) === true,
    mealsIncluded: asBool(row.meals_included),
    compensationMinCents: asNumber(row.compensation_min_cents),
    compensationMaxCents: asNumber(row.compensation_max_cents),
    visaSupport: asBool(row.visa_support),
    beginsAt: asString(row.begins_at),
    endsAt: asString(row.ends_at),
    status: asString(row.status),
  };
}

/** Max live listings scored per recompute (bounded work). */
const CANDIDATE_CAP = 500;

/**
 * Recompute and persist every (this seeker × live listing) match score.
 * Excluded pairings are skipped. Returns how many rows were written.
 */
export async function computeAndStoreMatchesForSeeker(
  seekerProfileId: string,
  nowMs: number = Date.now(),
): Promise<{ stored: number }> {
  const client = db();

  const { data: profile, error: profileError } = await client
    .from("seeker_profiles")
    .select("*")
    .eq("id", seekerProfileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (profileError) throw new Error(`matching: load seeker — ${profileError.message}`);
  if (!profile) return { stored: 0 };

  const { data: listings, error: listingsError } = await client
    .from("listings")
    .select("*")
    .eq("status", "live")
    .order("published_at", { ascending: false })
    .limit(CANDIDATE_CAP);
  if (listingsError) throw new Error(`matching: load listings — ${listingsError.message}`);

  const seekerInput = toSeekerInput(profile as Row);
  const computedAt = new Date(nowMs).toISOString();

  const rows = ((listings ?? []) as Row[])
    .map((listing) => ({
      listing,
      result: computeMatch(seekerInput, toListingInput(listing), { nowMs }),
    }))
    .filter(({ result }) => result.excluded === null)
    .map(({ listing, result }) => ({
      seeker_profile_id: seekerProfileId,
      listing_id: String(listing.id),
      score: result.score,
      raw_score: result.rawScore,
      band: result.band,
      confidence: result.confidence,
      components: result.components,
      caps_applied: result.capsApplied,
      computed_at: computedAt,
    }));

  if (rows.length === 0) return { stored: 0 };

  const { error: upsertError } = await client
    .from("match_scores")
    .upsert(rows, { onConflict: "seeker_profile_id,listing_id" });
  if (upsertError) throw new Error(`matching: persist — ${upsertError.message}`);

  return { stored: rows.length };
}

/** The strong-match floor (mirrors the ADR-040 "strong" band minScore). */
export const STRONG_MATCH_MIN_SCORE = 75;

/** A seeker who strongly matches a listing — the recipient of a new-match alert. */
export interface StrongMatchRecipient {
  readonly seekerProfileId: string;
  readonly recipientClerkUserId: string | null;
  readonly score: number;
}

export interface ListingMatchResult {
  readonly stored: number;
  readonly listingTitle: string;
  /** Seekers scoring at/above the strong floor, best first (bounded). */
  readonly strong: readonly StrongMatchRecipient[];
}

/** Max active seekers scored against one listing (bounded work). */
const SEEKER_CANDIDATE_CAP = 500;
/** Max strong-match recipients surfaced per listing (so one post can't spam). */
const STRONG_NOTIFY_CAP = 25;

/**
 * Compute + persist match scores for one LIVE listing against active seekers,
 * and return the strong matches (for the caller to notify). The inverse of
 * {@link computeAndStoreMatchesForSeeker}: this is the listing-side activation
 * that powers "a strong new match just posted" alerts.
 *
 * No-op (stored: 0) when the listing is missing or not live.
 */
export async function computeAndStoreMatchesForListing(
  listingId: string,
  nowMs: number = Date.now(),
): Promise<ListingMatchResult> {
  const client = db();

  const { data: listing } = await client
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();
  const listingRow = listing as Row | null;
  const listingTitle = listingRow && typeof listingRow.title === "string" ? listingRow.title : "";
  if (!listingRow || listingRow.status !== "live") {
    return { stored: 0, listingTitle, strong: [] };
  }

  const { data: seekers } = await client
    .from("seeker_profiles")
    .select("*")
    .is("deleted_at", null)
    .limit(SEEKER_CANDIDATE_CAP);

  const listingInput = toListingInput(listingRow);
  const computedAt = new Date(nowMs).toISOString();

  const rows: Record<string, unknown>[] = [];
  const strong: StrongMatchRecipient[] = [];

  for (const seeker of (seekers ?? []) as Row[]) {
    const result = computeMatch(toSeekerInput(seeker), listingInput, { nowMs });
    if (result.excluded !== null) continue;
    const seekerProfileId = String(seeker.id);
    rows.push({
      seeker_profile_id: seekerProfileId,
      listing_id: listingId,
      score: result.score,
      raw_score: result.rawScore,
      band: result.band,
      confidence: result.confidence,
      components: result.components,
      caps_applied: result.capsApplied,
      computed_at: computedAt,
    });
    if (result.score >= STRONG_MATCH_MIN_SCORE) {
      strong.push({
        seekerProfileId,
        recipientClerkUserId:
          typeof seeker.clerk_user_id === "string" ? seeker.clerk_user_id : null,
        score: result.score,
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await client
      .from("match_scores")
      .upsert(rows, { onConflict: "seeker_profile_id,listing_id" });
    if (error) throw new Error(`matching: persist listing — ${error.message}`);
  }

  strong.sort((a, b) => b.score - a.score);
  return { stored: rows.length, listingTitle, strong: strong.slice(0, STRONG_NOTIFY_CAP) };
}

/** A persisted match row, shaped for surfacing. */
export interface StoredMatch {
  readonly listingId: string;
  readonly score: number;
  readonly band: MatchBand;
  readonly confidence: number;
  readonly components: MatchComponentScores;
  readonly capsApplied: readonly MatchCap[];
}

/** Read a seeker's persisted matches, best first. */
export async function getTopMatchesForSeeker(
  seekerProfileId: string,
  limit = 50,
): Promise<StoredMatch[]> {
  const { data, error } = await db()
    .from("match_scores")
    .select("listing_id, score, band, confidence, components, caps_applied")
    .eq("seeker_profile_id", seekerProfileId)
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`matching: read — ${error.message}`);

  return ((data ?? []) as Row[]).map((row) => ({
    listingId: String(row.listing_id),
    score: asNumber(row.score) ?? 0,
    band: (asString(row.band) as MatchBand | null) ?? "needs_attention",
    confidence: asNumber(row.confidence) ?? 0,
    components: (row.components as MatchComponentScores) ?? ({} as MatchComponentScores),
    capsApplied: asStringArray(row.caps_applied) as MatchCap[],
  }));
}
