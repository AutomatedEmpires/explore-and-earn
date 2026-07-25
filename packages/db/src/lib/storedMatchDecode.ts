import {
  MATCH_BANDS,
  MATCH_SCORE_CAPS,
  matchBandFor,
  type MatchBand,
  type MatchCap,
  type MatchComponentScores,
} from "@explore-and-earn/contracts";

/**
 * Decoding for a persisted match_scores row (migration 052).
 *
 * Lives in lib/ rather than beside the query because queries/ imports
 * "server-only", which vitest cannot load — and this is exactly the code that
 * needs tests. It is pure: no client, no IO.
 */

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

/** Narrow an untrusted stored value to a real band id. */
function isMatchBand(value: unknown): value is MatchBand {
  return typeof value === "string" && MATCH_BANDS.some((band) => band.id === value);
}

/**
 * Decode one match_scores row, or null if it cannot be trusted.
 *
 * Everything here is DECODED, not cast. The row crosses a trust boundary: it is
 * shaped by whatever wrote it, and the listing-detail page renders its values
 * directly — the band picks an icon and a meter step, the caps become the
 * "Before you go further" lines. An unchecked cast surfaces as a blank blocker
 * or a broken meter at render time rather than as a type error here.
 */
export function decodeStoredMatchRow(
  row: Record<string, unknown>,
): StoredMatchResult | null {
  if (typeof row.score !== "number") return null;

  return {
    score: row.score,
    rawScore: typeof row.raw_score === "number" ? row.raw_score : row.score,
    // The band is definitionally a pure function of the score (matchBandFor),
    // so an absent or unrecognised stored band is RECOVERED rather than
    // trusted — never left to index a lookup table as undefined.
    band: isMatchBand(row.band) ? row.band : matchBandFor(row.score),
    confidence: typeof row.confidence === "number" ? row.confidence : 0,
    components: (row.components ?? {}) as MatchComponentScores,
    // caps_applied is text[]. Object.hasOwn, NOT `in`: `in` walks the prototype
    // chain, so "toString" and "__proto__" would pass as caps and then resolve
    // to an undefined signal code at render time.
    capsApplied: Array.isArray(row.caps_applied)
      ? row.caps_applied.filter(
          (cap): cap is MatchCap =>
            typeof cap === "string" && Object.hasOwn(MATCH_SCORE_CAPS, cap),
        )
      : [],
    computedAt: typeof row.computed_at === "string" ? row.computed_at : null,
  };
}
