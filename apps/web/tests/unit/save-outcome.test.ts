import { describe, expect, it } from "vitest";

import { resolveSaveOutcome } from "../../lib/saveOutcome";
import type { SaveFailureReason, SaveResult } from "../../app/actions/savedListings";

/**
 * The Save control on the listing detail page (UX review 2026-07-23).
 *
 * The defect this pins: handleToggleSave discarded the action's result and had
 * no catch, so it flipped the label to "Saved" unconditionally. saveListingAction
 * returns { ok: false } when the seeker is rate-limited (60 / 5 min) or their
 * session has expired, and re-throws on a database error — so in all three
 * cases the seeker was shown "Saved" for a listing that was never written, and
 * would find it missing from /saved later.
 *
 * The rule under test: the label moves ONLY on a confirmed write.
 */

const ALL_REASONS: readonly SaveFailureReason[] = [
  "unauthenticated",
  "rate_limit_exceeded",
  "temporarily_unavailable",
  "failed",
];

describe("resolveSaveOutcome", () => {
  it("commits the new state when the write is confirmed", () => {
    expect(resolveSaveOutcome(true, { ok: true })).toEqual({
      kind: "committed",
      saved: true,
    });
  });

  it("commits an unsave when the write is confirmed", () => {
    expect(resolveSaveOutcome(false, { ok: true })).toEqual({
      kind: "committed",
      saved: false,
    });
  });

  it("treats a thrown action as an error, never as a save", () => {
    expect(resolveSaveOutcome(true, null)).toEqual({
      kind: "error",
      reason: "failed",
    });
  });

  it("treats an unexplained failure as an error, never as a save", () => {
    expect(resolveSaveOutcome(true, { ok: false })).toEqual({
      kind: "error",
      reason: "failed",
    });
  });

  it.each(ALL_REASONS)("surfaces %s as its own reason", (reason) => {
    expect(resolveSaveOutcome(true, { ok: false, error: reason })).toEqual({
      kind: "error",
      reason,
    });
  });

  /**
   * The negative control, stated exhaustively: enumerate every way the action
   * can fail and assert that none of them can produce a committed state. This
   * is the assertion that would have caught the original bug — and the one
   * that fails if anyone reinstates an unconditional flip.
   */
  it("NEVER commits for any failure mode", () => {
    const failures: readonly (SaveResult | null)[] = [
      null,
      { ok: false },
      ...ALL_REASONS.map((error) => ({ ok: false, error })),
    ];
    for (const nextSaved of [true, false]) {
      for (const result of failures) {
        expect(resolveSaveOutcome(nextSaved, result).kind).toBe("error");
      }
    }
  });
});
