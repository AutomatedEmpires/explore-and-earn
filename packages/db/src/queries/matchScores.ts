import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MATCH_SCORE_CAPS,
  type MatchBand,
  type MatchCap,
  type MatchComponentScores,
} from "@explore-and-earn/contracts";

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

/** The full stored engine result for ONE (seeker, listing) pairing. */
export interface StoredMatchResult {
  readonly score: number;
  readonly rawScore: number;
  readonly band: MatchBand;
  readonly confidence: number;
  readonly components: MatchComponentScores;
  readonly capsApplied: readonly MatchCap[];
  readonly computedAt: string | null;
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

    const row = data as Record<string, unknown>;
    if (typeof row.score !== "number") return null;

    return {
      score: row.score,
      rawScore: typeof row.raw_score === "number" ? row.raw_score : row.score,
      band: row.band as MatchBand,
      confidence: typeof row.confidence === "number" ? row.confidence : 0,
      components: (row.components ?? {}) as MatchComponentScores,
      // caps_applied is text[]; anything unrecognised is dropped rather than
      // rendered, so a future cap added server-side cannot print as a raw code.
      capsApplied: Array.isArray(row.caps_applied)
        ? (row.caps_applied.filter(
            (cap): cap is MatchCap =>
              typeof cap === "string" && cap in MATCH_SCORE_CAPS,
          ) as MatchCap[])
        : [],
      computedAt: typeof row.computed_at === "string" ? row.computed_at : null,
    };
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
      .select("seeker_profile_id, listing_id, score, band, confidence");
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
      });
    }
  } catch {
    // match_scores may not exist yet (pre-052); degrade to no scores.
  }
  return map;
}
