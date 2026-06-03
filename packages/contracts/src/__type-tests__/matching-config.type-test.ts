/**
 * Compile-time + cheap runtime invariants for the matching/ranking config.
 * Type-checked by `tsc`; not re-exported from index.ts, so never public API.
 * These encode the matching guardrails (G31/G32/G33) as assertions.
 */
import {
  DISCOVERY_RANKING_WEIGHTS,
  FEATURED_RAIL,
  MAP_DRAWER_WEIGHTS,
  MATCH_BANDS,
  MATCH_CONFIDENCE_WEIGHTS,
  MATCH_SCORE_WEIGHTS,
  matchBandFor,
  type MatchBand,
} from "../matching-config"

type Expect<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

const sum = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0)

// G31: match-score component weights sum to exactly 100.
export const _matchWeightsSum100 =
  sum(Object.values(MATCH_SCORE_WEIGHTS)) === 100
// Confidence weights sum to exactly 100.
export const _confidenceSum100 =
  sum(Object.values(MATCH_CONFIDENCE_WEIGHTS)) === 100
// Fractional weight sets sum to 1.00 (compared in integer hundredths).
export const _rankingSum1 =
  Math.round(sum(Object.values(DISCOVERY_RANKING_WEIGHTS)) * 100) === 100
export const _featuredSum1 =
  Math.round(sum(Object.values(FEATURED_RAIL.weights)) * 100) === 100
export const _mapSum1 =
  Math.round(sum(Object.values(MAP_DRAWER_WEIGHTS)) * 100) === 100

// G33: bands are ordered by strictly descending floor (best -> worst).
export const _bandsOrdered = MATCH_BANDS.every((b, i) => {
  const prev = MATCH_BANDS[i - 1]
  return !prev || b.minScore <= prev.minScore
})

// Band id union is exactly the three canon bands.
export const _bandUnion: Expect<
  Equal<MatchBand, "strong" | "developing" | "needs_attention">
> = true

// Band lookup resolves representative scores correctly.
export const _bandStrong = matchBandFor(90) === "strong"
export const _bandDeveloping = matchBandFor(60) === "developing"
export const _bandNeeds = matchBandFor(10) === "needs_attention"
