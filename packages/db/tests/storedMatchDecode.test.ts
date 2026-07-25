/**
 * Decoding of a match_scores row (queries/matchScores.ts decodeStoredMatchRow).
 *
 * A stored row crosses a trust boundary: it is shaped by whatever wrote it, and
 * the listing-detail page renders its values directly — the band picks an icon
 * and a meter step, the caps become the "Before you go further" lines. A bad
 * value therefore shows up as a blank blocker or a broken meter, not as a type
 * error, so these tests are all refusals.
 */
import { describe, expect, it } from "vitest";

import { decodeStoredMatchRow } from "../src/lib/storedMatchDecode";

const good = {
  score: 84,
  raw_score: 90,
  band: "strong",
  confidence: 70,
  components: { categoryRoleFit: 88 },
  caps_applied: ["requiredCertificationMissing"],
  computed_at: "2026-07-15T00:00:00Z",
};

describe("decodeStoredMatchRow — accepts a well-formed row", () => {
  it("passes every field through", () => {
    const out = decodeStoredMatchRow({ ...good });
    expect(out).not.toBeNull();
    expect(out?.score).toBe(84);
    expect(out?.rawScore).toBe(90);
    expect(out?.band).toBe("strong");
    expect(out?.confidence).toBe(70);
    expect(out?.capsApplied).toEqual(["requiredCertificationMissing"]);
    expect(out?.computedAt).toBe("2026-07-15T00:00:00Z");
  });
});

describe("decodeStoredMatchRow — refusals", () => {
  it("returns null when the score is missing or not a number", () => {
    expect(decodeStoredMatchRow({ ...good, score: undefined })).toBeNull();
    expect(decodeStoredMatchRow({ ...good, score: "84" })).toBeNull();
    expect(decodeStoredMatchRow({})).toBeNull();
  });

  it("does NOT admit inherited Object.prototype keys as caps", () => {
    // The bug this guards: `cap in MATCH_SCORE_CAPS` walks the prototype chain,
    // so these would have decoded as real caps and then rendered as a blocker
    // whose signal code is undefined.
    const out = decodeStoredMatchRow({
      ...good,
      caps_applied: ["toString", "__proto__", "constructor", "hasOwnProperty"],
    });
    expect(out?.capsApplied).toEqual([]);
  });

  it("drops unrecognised cap strings but keeps the real ones alongside them", () => {
    const out = decodeStoredMatchRow({
      ...good,
      caps_applied: ["requiredCertificationMissing", "someFutureCap", "toString"],
    });
    expect(out?.capsApplied).toEqual(["requiredCertificationMissing"]);
  });

  it("tolerates a non-array caps_applied", () => {
    expect(decodeStoredMatchRow({ ...good, caps_applied: null })?.capsApplied).toEqual([]);
    expect(decodeStoredMatchRow({ ...good, caps_applied: "strong" })?.capsApplied).toEqual([]);
  });

  it("recovers the band from the score when the stored band is invalid", () => {
    // 84 is in the strong band (floor 75), so a null/garbage band must not
    // survive to index BAND_STEPS / BAND_ICON as undefined.
    expect(decodeStoredMatchRow({ ...good, band: null })?.band).toBe("strong");
    expect(decodeStoredMatchRow({ ...good, band: "excellent" })?.band).toBe("strong");
    expect(decodeStoredMatchRow({ ...good, band: 3 })?.band).toBe("strong");
    // ...and the recovery tracks the actual score, rather than defaulting high.
    expect(decodeStoredMatchRow({ ...good, score: 20, band: null })?.band).toBe(
      "needs_attention",
    );
    expect(decodeStoredMatchRow({ ...good, score: 60, band: "" })?.band).toBe("developing");
  });

  it("falls back to the score for rawScore, and 0 for a missing confidence", () => {
    const out = decodeStoredMatchRow({ ...good, raw_score: null, confidence: "70" });
    expect(out?.rawScore).toBe(84);
    expect(out?.confidence).toBe(0);
  });

  it("never returns undefined components", () => {
    expect(decodeStoredMatchRow({ ...good, components: null })?.components).toEqual({});
  });
});
