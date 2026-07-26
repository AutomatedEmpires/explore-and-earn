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
 * A score we are willing to render. `typeof NaN === "number"`, so a bare typeof
 * check admits NaN — and NaN compares false against every band floor, so it
 * would silently resolve to "needs_attention" and present as a real verdict.
 * The 0–100 bound mirrors the CHECK constraint in migration 052; the point of
 * repeating it here is that this decoder must not depend on the writer.
 */
function isRenderableScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Component scores are a plain record of numbers. `?? {}` only catches
 * null/undefined — a string, number, boolean or array would pass straight
 * through the cast and into MatchTrace.components. Arrays are excluded
 * explicitly because `typeof [] === "object"`.
 */
function toComponentScores(value: unknown): MatchComponentScores {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {} as MatchComponentScores;
  }
  const clean: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "number" && Number.isFinite(entry)) clean[key] = entry;
  }
  return clean as MatchComponentScores;
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
  if (!isRenderableScore(row.score)) return null;

  return {
    score: row.score,
    rawScore: isRenderableScore(row.raw_score) ? row.raw_score : row.score,
    // The band is definitionally a pure function of the score (matchBandFor),
    // so an absent or unrecognised stored band is RECOVERED rather than
    // trusted — never left to index a lookup table as undefined.
    band: isMatchBand(row.band) ? row.band : matchBandFor(row.score),
    confidence: isRenderableScore(row.confidence) ? row.confidence : 0,
    components: toComponentScores(row.components),
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
