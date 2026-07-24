import { describe, expect, it } from "vitest";

import {
  fitCoverageSentence,
  groupFitSignals,
  MIN_RATED_FOR_VERDICT,
} from "../../lib/fitGroups";
import type { MatchSignal, MatchSignalPolarity } from "@explore-and-earn/contracts";

/**
 * The fit section must never present an uncomputed component as a reason
 * (UX review 2026-07-24).
 *
 * The defect this pins: the old section derived its bullets from raw component
 * scores via topMatchReasons(). Several components fall back to an "unknown"
 * sentinel (~65) when the seeker stated nothing, and those sentinels clear the
 * reason threshold (minSubScore 55). So a seeker who had told us nothing about
 * their availability, travel range or pay expectation was shown confident
 * prose: "The timing lines up with when you're free."
 *
 * buildMatchTrace already tags those signals with polarity "missing". The rule
 * under test is the one thing that makes the section honest: a missing signal
 * is an open question, never evidence.
 */

function signal(
  polarity: MatchSignalPolarity,
  code = "category_match",
): MatchSignal {
  return { code, component: "categoryRoleFit", polarity } as MatchSignal;
}

const MISSING = signal("missing", "seeker_availability_unknown");
const POSITIVE = signal("positive");
const NEGATIVE = signal("negative", "pay_below_expectation");
const BLOCKER = signal("blocker", "required_certification_missing");

describe("groupFitSignals", () => {
  it("keeps a missing signal out of the evidence groups", () => {
    const g = groupFitSignals({ signals: [POSITIVE, MISSING] });
    expect(g.positives).toHaveLength(1);
    expect(g.watch).toHaveLength(0);
    expect(g.missing).toEqual([MISSING]);
    expect(g.positives).not.toContain(MISSING);
  });

  it("counts only computed signals toward coverage", () => {
    const g = groupFitSignals({ signals: [POSITIVE, NEGATIVE, MISSING] });
    expect(g.ratedCount).toBe(2);
  });

  it("declines a verdict when almost nothing was computed", () => {
    expect(groupFitSignals({ signals: [MISSING] }).tooThin).toBe(true);
    expect(groupFitSignals({ signals: [MISSING, MISSING] }).tooThin).toBe(true);
    expect(groupFitSignals({ signals: [POSITIVE, NEGATIVE] }).tooThin).toBe(false);
  });

  it("separates computed-but-unfavourable from not-computed", () => {
    const g = groupFitSignals({ signals: [NEGATIVE, MISSING] });
    expect(g.watch).toEqual([NEGATIVE]);
    expect(g.missing).toEqual([MISSING]);
  });

  it("surfaces blockers before anything else", () => {
    const g = groupFitSignals({ signals: [POSITIVE, BLOCKER] });
    expect(g.blockers).toEqual([BLOCKER]);
  });

  it("describes coverage without implying the missing parts were judged", () => {
    expect(
      fitCoverageSentence(groupFitSignals({ signals: [POSITIVE, NEGATIVE, MISSING] })),
    ).toBe("Based on 2 things we could check — 1 still needs something from you.");
    expect(
      fitCoverageSentence(groupFitSignals({ signals: [POSITIVE, NEGATIVE] })),
    ).toBe("Based on 2 things we could check.");
  });

  /**
   * The negative control, exhaustive over polarity: no arrangement of signals
   * may put a "missing" one into positives or watch. This is the assertion that
   * would have caught the original bug.
   */
  it("NEVER lets a missing signal become evidence, for any mix", () => {
    const polarities: MatchSignalPolarity[] = [
      "positive",
      "negative",
      "blocker",
      "missing",
      "weak",
    ];
    for (const a of polarities) {
      for (const b of polarities) {
        const g = groupFitSignals({ signals: [signal(a), signal(b, "x_unknown")] });
        for (const s of [...g.positives, ...g.watch, ...g.blockers]) {
          expect(s.polarity).not.toBe("missing");
        }
        // and nothing is silently dropped
        const total =
          g.positives.length + g.watch.length + g.blockers.length + g.missing.length;
        expect(total).toBe(2);
      }
    }
  });

  it("treats an empty trace as thin rather than as agreement", () => {
    const g = groupFitSignals({ signals: [] });
    expect(g.ratedCount).toBe(0);
    expect(g.tooThin).toBe(true);
    expect(MIN_RATED_FOR_VERDICT).toBeGreaterThan(0);
  });
});
