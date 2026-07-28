import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchBand, MatchComponentScores } from "@explore-and-earn/contracts";

import {
  decodeStoredMatchRow,
  toComponentScores,
  type StoredMatchResult,
} from "../lib/storedMatchDecode";

import { authedClient } from "../client";

/**
 * Read access to the ADR-040 match_scores cache (migration 052).
 *
 * Host-scoped by RLS: the match_scores host-read policy only returns rows for
 * listings the caller owns (listing_id in current_host_listing_ids()), so a
 * plain select over the authed host token yields exactly their listings' scores.
 * Resilient by design — returns an empty map on any error (e.g. before 052 is
 * applied), so surfaces degrade gracefully rather than break.
 */

export interface ListingMatchScore {
  readonly seekerProfileId: string;
  readonly listingId: string;
  readonly score: number;
  readonly band: MatchBand;
  readonly confidence: number;
  /**
   * The persisted per-component sub-scores (migration 052's `components` JSONB).
   *
   * Carried because a bare number is not an answer a host can act on: "84" says
   * nothing about WHY, and the founder's V2 requirement for the applicant
   * surfaces is an explanation, not a score. The explanation itself is NOT
   * stored (G34) — matchReasonPhrase/topMatchReasons derive it from these
   * numbers at render time, so the copy can change without a migration.
   *
   * An empty record is the honest "no components stored" answer; callers must
   * render no reason at all rather than inventing one.
   */
  readonly components: MatchComponentScores;
}

/** Key an applicant's score by listing + seeker. */
export function matchScoreKey(listingId: string, seekerProfileId: string): string {
  return `${listingId}:${seekerProfileId}`;
}

/**
 * Resolve seeker_profiles.id for the authed Clerk user. Local copy (each query
 * module keeps its own thin resolver); `clerkUserId` MUST come from
 * auth().userId. Returns null (not throw) so a scoring read degrades to
 * "no stored scores" rather than breaking the surface that reads it.
 */
async function resolveSeekerProfileId(
  clerkToken: string,
  clerkUserId: string,
): Promise<string | null> {
  try {
    const db = authedClient(clerkToken) as unknown as SupabaseClient;
    const { data, error } = await db
      .from("seeker_profiles")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    if (error || !data) return null;
    return String((data as { id: string }).id);
  } catch {
    return null;
  }
}

/**
 * Stored ADR-040 match scores for the authed SEEKER, as a `Map<listingId,
 * score>` ready to hand to {@link enrichmentFromScope} / rowToDiscoveryFields.
 *
 * READ-ONLY cache lookup — scores are computed off the request path by the
 * matching service and upserted into match_scores (migration 052). Reading here
 * means /seek, the map, and the matched rails surface the SAME persisted number
 * everywhere instead of recomputing scoreSeekerListingRow per render.
 *
 * Scoped two ways for safety: the match_scores_select_seeker RLS policy already
 * restricts rows to the caller's own seeker profile(s), and we additionally
 * filter by the resolved seeker_profile_id so a user who is also a host never
 * pulls host-readable rows into their seeker feed. Resilient by design —
 * returns an empty map on any fault (pre-052 schema, no profile, RLS/permission
 * error) so surfaces degrade to "no scores" rather than break.
 */
export async function getMatchScoresForSeeker(
  clerkToken: string,
  clerkUserId: string,
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  try {
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId) return scores;

    const db = authedClient(clerkToken) as unknown as SupabaseClient;
    const { data, error } = await db
      .from("match_scores")
      .select("listing_id, score")
      .eq("seeker_profile_id", seekerProfileId);
    if (error || !data) return scores;

    for (const raw of data as Array<Record<string, unknown>>) {
      const listingId = raw.listing_id != null ? String(raw.listing_id) : "";
      if (listingId && typeof raw.score === "number") {
        scores.set(listingId, raw.score);
      }
    }
  } catch {
    // match_scores may not exist yet (pre-052) — degrade to no scores.
  }
  return scores;
}

/**
 * The stored engine result for the authed seeker and ONE listing — the same row
 * the discovery pill reads, not a recomputation of it.
 *
 * This exists because the listing-detail page used to recompute the fit inline
 * from a much smaller input set than the matching service uses, so the page and
 * the card it was opened from could disagree about the same pairing. Reading the
 * stored row is what makes them the same assertion; see
 * docs/product/listing-fit-single-source.md.
 *
 * Scoped exactly like {@link getMatchScoresForSeeker}: the
 * match_scores_select_seeker RLS policy restricts rows to the caller's own
 * seeker profile(s), and we additionally filter by the resolved
 * seeker_profile_id so a user who is also a host can never pull a
 * host-readable row into a seeker surface. Resilient by design — returns null
 * on any fault (pre-052 schema, no profile, RLS/permission error), which
 * callers must treat as "not scored yet", never as "scored zero".
 */
export async function getSeekerListingMatch(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<StoredMatchResult | null> {
  try {
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId) return null;

    const db = authedClient(clerkToken) as unknown as SupabaseClient;
    const { data, error } = await db
      .from("match_scores")
      .select("score, raw_score, band, confidence, components, caps_applied, computed_at")
      .eq("seeker_profile_id", seekerProfileId)
      .eq("listing_id", listingId)
      .maybeSingle();
    if (error || !data) return null;

    return decodeStoredMatchRow(data as Record<string, unknown>);
  } catch {
    // match_scores may not exist yet (pre-052) — degrade to "not scored yet".
    return null;
  }
}

/**
 * All match scores for the authed host's listings, keyed by
 * `${listingId}:${seekerProfileId}` via {@link matchScoreKey}.
 */
export async function getMatchScoresForHost(
  clerkToken: string,
): Promise<Map<string, ListingMatchScore>> {
  const map = new Map<string, ListingMatchScore>();
  try {
    const db = authedClient(clerkToken) as unknown as SupabaseClient;
    const { data, error } = await db
      .from("match_scores")
      .select("seeker_profile_id, listing_id, score, band, confidence, components");
    if (error || !data) return map;

    for (const raw of data as Array<Record<string, unknown>>) {
      const seekerProfileId = String(raw.seeker_profile_id);
      const listingId = String(raw.listing_id);
      map.set(matchScoreKey(listingId, seekerProfileId), {
        seekerProfileId,
        listingId,
        score: typeof raw.score === "number" ? raw.score : 0,
        band: (typeof raw.band === "string" ? raw.band : "needs_attention") as MatchBand,
        confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
        // Decoded, not cast: the JSONB is shaped by whatever wrote it, and a
        // string or array would otherwise flow into topMatchReasons and render
        // as a reason nobody computed.
        components: toComponentScores(raw.components),
      });
    }
  } catch {
    // match_scores may not exist yet (pre-052); degrade to no scores.
  }
  return map;
}
