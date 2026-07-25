import {
  CAP_SIGNAL_CODES,
  type MatchSignal,
  type MatchTrace,
} from "@explore-and-earn/contracts";
import type { StoredMatchResult } from "@explore-and-earn/db";

/**
 * Which engine result the listing-detail page is allowed to show, and what the
 * "How this lines up for you" section is allowed to say about it.
 *
 * WHY THIS MODULE EXISTS.
 *
 * The page used to recompute the fit inline. That recompute ran the same engine
 * as the matching service but on a much smaller input set — 7 of 20 seeker
 * fields and 12 of 20 listing fields, versus the service's 18 and 17. Measured
 * on one realistic pairing the two produced 72 and 84.
 *
 * That gap is not cosmetic, because of an exact coincidence: the discovery card
 * only renders its percentage pill at a stored score of 75 or above
 * (MEANINGFUL_MATCH_SCORE_THRESHOLD / MATCH_SHOW_THRESHOLD), and 75 is also the
 * floor of the "Strong match" band. So the presence of a pill and the word on
 * the detail page are THE SAME CLAIM, and a pairing that straddles 75 makes one
 * surface contradict the other: a card reading "84% Match" opening a page that
 * says "Developing match", or a card with no pill at all opening a page that
 * announces a strong one.
 *
 * The rule below is therefore: the number the card showed is the only number
 * this page may repeat. It is never recomputed here.
 *
 * This lives in a plain .ts module rather than in the page because apps/web sets
 * `jsx: preserve`, so vitest cannot transform the .tsx — logic that needs a test
 * has to live outside the component. An honesty rule needs a test.
 */

export type ListingFitResolution =
  | { readonly kind: "scored"; readonly trace: MatchTrace }
  | { readonly kind: "not_scored" };

/**
 * Build the trace to render from the STORED engine result plus locally derived
 * qualitative signals.
 *
 * Two rules, both load-bearing:
 *
 * 1. NO STORED ROW MEANS NO BAND. A missing row is "we have not scored this
 *    pairing yet", not "we scored it zero" — and critically, it is also the
 *    state in which the card shows no pill. Falling back to a local recompute
 *    here would reintroduce the exact contradiction this change removes, so the
 *    caller must render its existing prompt instead.
 *
 * 2. BLOCKERS COME FROM THE STORED CAPS, NEVER FROM A LOCAL RECOMPUTE. Caps are
 *    the "Before you go further" lines, and they are the part the impoverished
 *    local input set gets *silently* wrong: `requiredCertificationMissing` is
 *    gated first on the listing's required-certification array, which the
 *    detail-page listing mapper never supplies, so a local recompute reports no
 *    blocker for a listing the seeker is not certified for. The stored row was
 *    computed with those fields and is the only trustworthy source for them.
 *
 * Non-blocker signals (positive / negative / missing) are carried over from the
 * locally computed trace: they are qualitative per-axis lines, and the UI
 * already tags axes it could not compute with polarity "missing" rather than
 * dressing them up as reasons. They are explanation, not assertion — the
 * assertion is the stored number.
 */
export function resolveListingFit(
  stored: StoredMatchResult | null,
  localTrace: MatchTrace | null,
): ListingFitResolution {
  if (!stored) return { kind: "not_scored" };

  // Rule 2: drop every locally derived blocker. Their absence is not evidence
  // of no blocker, so keeping them alongside the stored caps would let an
  // impoverished "no cap" result dilute a real one.
  const qualitative = (localTrace?.signals ?? []).filter(
    (signal) => signal.polarity !== "blocker",
  );

  const blockers: MatchSignal[] = stored.capsApplied.map((cap) => ({
    code: CAP_SIGNAL_CODES[cap],
    component: null,
    polarity: "blocker",
  }));

  return {
    kind: "scored",
    trace: {
      // Always null, and that is a property of the writer rather than an
      // assumption: the matching service filters `result.excluded === null`
      // before it upserts, so an excluded pairing never becomes a stored row.
      // A row existing therefore *means* not-excluded. If that filter is ever
      // removed, `excluded` must start being persisted and read here — an
      // excluded pairing must not render as a band.
      excluded: null,
      // Numbers are the stored row's, verbatim — this is the whole point.
      score: stored.score,
      rawScore: stored.rawScore,
      band: stored.band,
      confidence: stored.confidence,
      components: stored.components,
      capsApplied: stored.capsApplied,
      signals: [...blockers, ...qualitative],
    },
  };
}
