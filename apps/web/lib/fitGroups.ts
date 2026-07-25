import {
  orderedTraceSignals,
  type MatchSignal,
  type MatchTrace,
} from "@explore-and-earn/contracts";

/**
 * How the listing-detail fit section is allowed to group a match trace.
 *
 * This is a truth rule, so it lives in its own module rather than inside the
 * renderer. The defect it prevents: the previous section derived its bullets
 * from raw component scores via topMatchReasons(), but several components fall
 * back to an "unknown" sentinel (~65) when the seeker stated nothing, and those
 * sentinels clear the reason threshold. A seeker who had told us nothing was
 * therefore shown "The timing lines up with when you're free."
 *
 * The trace already distinguishes them — buildMatchTrace tags every
 * sentinel-derived signal with polarity "missing" — so the single invariant
 * here is: a "missing" signal is NEVER evidence, only an open question.
 */

export type FitGroupId = "blocker" | "positive" | "watch" | "missing";

export interface FitGroups {
  /** Hard incompatibilities — shown before any praise. */
  readonly blockers: readonly MatchSignal[];
  /** Genuinely computed strengths. */
  readonly positives: readonly MatchSignal[];
  /** Computed, but working against the seeker. */
  readonly watch: readonly MatchSignal[];
  /** Not computable — the seeker hasn't told us. Never evidence. */
  readonly missing: readonly MatchSignal[];
  /** How many signals were actually computed from real input. */
  readonly ratedCount: number;
  /**
   * True when so little was computed that any band would be a verdict derived
   * mostly from defaults.
   */
  readonly tooThin: boolean;
}

/** Below this many computed signals we decline to characterise the pairing. */
export const MIN_RATED_FOR_VERDICT = 2;

export function groupFitSignals(trace: Pick<MatchTrace, "signals">): FitGroups {
  const ordered = orderedTraceSignals(trace);
  const blockers = ordered.filter((s) => s.polarity === "blocker");
  const positives = ordered.filter((s) => s.polarity === "positive");
  const watch = ordered.filter(
    (s) => s.polarity === "negative" || s.polarity === "weak",
  );
  const missing = ordered.filter((s) => s.polarity === "missing");
  const ratedCount = ordered.length - missing.length;

  return {
    blockers,
    positives,
    watch,
    missing,
    ratedCount,
    tooThin: ratedCount < MIN_RATED_FOR_VERDICT,
  };
}

/** "Based on 3 things we could check — 2 still need something from you." */
export function fitCoverageSentence(groups: FitGroups): string {
  const rated = `Based on ${groups.ratedCount} thing${groups.ratedCount === 1 ? "" : "s"} we could check`;
  if (groups.missing.length === 0) return `${rated}.`;
  const n = groups.missing.length;
  return `${rated} — ${n} still need${n === 1 ? "s" : ""} something from you.`;
}
