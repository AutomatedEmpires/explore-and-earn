// Match result contract — the typed output of the matching engine.
//
// Pairs with the LOCKED config in matching-config.ts (ADR-040). This file adds
// only the *result* shape + a render-time explanation helper. It stores NO
// explanation text (G34): reasons are derived from the numeric component scores
// at render time, so copy can change without a migration and stale sentences
// can never ship.

import {
  MATCH_SCORE_WEIGHTS,
  MATCH_SCORE_CAPS,
  type MatchBand,
  type MatchExclusion,
  type MatchScoreComponent,
} from "./matching-config"

/** The hard-ceiling modifiers (keys of MATCH_SCORE_CAPS). */
export type MatchCap = keyof typeof MATCH_SCORE_CAPS

/** Per-component normalized sub-scores, each 0-100 (pre-weight). */
export type MatchComponentScores = Record<MatchScoreComponent, number>

/**
 * The full result of scoring one seeker against one listing.
 *
 * `components` and `capsApplied` are what get persisted to `match_scores`
 * (numbers only — G34). `band`/`confidence` are derived, cheap to recompute.
 */
export interface MatchResult {
  /** Non-null when the pairing is excluded (never scored/shown). */
  readonly excluded: MatchExclusion | null
  /** 0-100 integer AFTER caps. */
  readonly score: number
  /** 0-100 integer BEFORE caps (the pure weighted sum). */
  readonly rawScore: number
  readonly band: MatchBand
  /** 0-100 — data-quality axis, distinct from score (ADR-040). */
  readonly confidence: number
  /** Each component's 0-100 sub-score, pre-weight. */
  readonly components: MatchComponentScores
  /** Which hard ceilings fired (empty when none). */
  readonly capsApplied: readonly MatchCap[]
}

/**
 * Presentation labels per component — used ONLY at render time by
 * {@link topMatchReasons}. Never persisted (G34).
 */
export const MATCH_COMPONENT_LABELS: Record<MatchScoreComponent, string> = {
  categoryRoleFit: "work type",
  locationTravelFit: "location",
  availabilityOverlap: "availability",
  payAlignment: "pay",
  housingMealsFit: "housing & meals",
  profileCompleteness: "profile",
}

export interface MatchReason {
  readonly component: MatchScoreComponent
  readonly label: string
  /** Weighted contribution to the score (component sub-score × weight). */
  readonly contribution: number
}

/**
 * Derive the top contributing components at RENDER time from the numeric
 * component scores (G34: reasons are computed, never stored). Returns up to `n`
 * components ranked by weighted contribution, filtered to those whose sub-score
 * clears `minSubScore` — so a weak signal is never surfaced as a "reason".
 */
export function topMatchReasons(
  components: MatchComponentScores,
  n = 2,
  minSubScore = 55,
): readonly MatchReason[] {
  return (Object.keys(MATCH_SCORE_WEIGHTS) as MatchScoreComponent[])
    .map((component) => {
      const sub = components[component] ?? 0
      return {
        component,
        label: MATCH_COMPONENT_LABELS[component],
        contribution: sub * MATCH_SCORE_WEIGHTS[component],
        sub,
      }
    })
    .filter((reason) => reason.sub >= minSubScore)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, n)
    .map(({ component, label, contribution }) => ({ component, label, contribution }))
}

/**
 * Compose a short, human-readable match phrase from the top reasons, e.g.
 * "Strong on availability & pay". Render-time only (G34).
 */
export function matchReasonPhrase(components: MatchComponentScores): string | null {
  const reasons = topMatchReasons(components)
  if (reasons.length === 0) return null
  const labels = reasons.map((reason) => reason.label)
  const joined =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`
  return `Strong on ${joined}`
}
