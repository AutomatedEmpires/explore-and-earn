import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchBand } from "@explore-and-earn/contracts";

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
