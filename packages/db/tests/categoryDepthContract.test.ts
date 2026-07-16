/**
 * Category depth — the rules about WHAT MAY BE STORED (migration 069).
 *
 * The one rule everything here serves: a fact the host never stated has no key.
 * There is no sentinel VALUE, because a written sentinel is indistinguishable
 * from a real answer once it is in the column. So these tests assert ABSENCE
 * with `.not.toHaveProperty` rather than asserting some "unknown" marker — if a
 * sentinel is ever introduced, they fail.
 *
 * The sibling suite (apps/web/tests/unit/maritime-facts.test.ts) pins the same
 * rules at the RENDER boundary. Both are needed: this one stops a claim being
 * persisted, that one stops a claim being shown.
 */

import { describe, expect, it } from "vitest";

import {
  BERTH_TYPES,
  VESSEL_TYPES,
  categoryDepthFreshness,
  hasCategoryDepth,
  sanitizeCategoryDepth,
  sanitizeMaritimeDepth,
} from "@explore-and-earn/contracts";

const NOW = Date.parse("2026-07-16T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("sanitizeMaritimeDepth — absence is the only 'not stated'", () => {
  it("keeps every fact the host actually stated", () => {
    const out = sanitizeMaritimeDepth({
      vesselType: "tall_ship",
      lengthFeet: 148,
      berthAboard: true,
      berthType: "bunk_shared",
      crewSize: 12,
      reportedAt: daysAgo(5),
    });
    expect(out).toEqual({
      vesselType: "tall_ship",
      lengthFeet: 148,
      berthAboard: true,
      berthType: "bunk_shared",
      crewSize: 12,
      reportedAt: daysAgo(5),
    });
  });

  it("stores NO KEY for anything unstated — never a sentinel", () => {
    const out = sanitizeMaritimeDepth({ vesselType: "workboat" });
    expect(out).toEqual({ vesselType: "workboat" });
    // The point of the whole design: silence is absence, not a stored value.
    expect(out).not.toHaveProperty("berthAboard");
    expect(out).not.toHaveProperty("lengthFeet");
    expect(out).not.toHaveProperty("crewSize");
    expect(out).not.toHaveProperty("berthType");
  });

  it("distinguishes an explicit 'you do not sleep aboard' from silence", () => {
    // The decision-changing fact. These two must never collapse into each other.
    expect(sanitizeMaritimeDepth({ berthAboard: false })).toEqual({ berthAboard: false });
    expect(sanitizeMaritimeDepth({ vesselType: "charter_boat" })).not.toHaveProperty(
      "berthAboard",
    );
  });

  it("DROPS unknown enum values instead of guessing", () => {
    const out = sanitizeMaritimeDepth({
      vesselType: "submarine",
      berthType: "hammock",
      crewSize: 4,
    });
    expect(out).toEqual({ crewSize: 4 });
  });

  it("cannot claim 'no berth aboard' AND a berth type at once", () => {
    const out = sanitizeMaritimeDepth({
      berthAboard: false,
      berthType: "private_cabin",
      vesselType: "motor_yacht",
    });
    expect(out).toEqual({ berthAboard: false, vesselType: "motor_yacht" });
    expect(out).not.toHaveProperty("berthType");
  });

  it("keeps a stated berthType when berthAboard was simply never answered", () => {
    // Only an EXPLICIT false makes berth privacy incoherent. Silence doesn't —
    // dropping it there would discard a claim the host actually made.
    const out = sanitizeMaritimeDepth({ berthType: "private_cabin" });
    expect(out).toEqual({ berthType: "private_cabin" });
  });

  it("DROPS implausible measurements rather than clamping them", () => {
    // Clamping would invent a number the host never said and show it as theirs.
    for (const lengthFeet of [0, -30, 5000, Number.NaN, Number.POSITIVE_INFINITY, "40"]) {
      expect(sanitizeMaritimeDepth({ lengthFeet, crewSize: 3 })).not.toHaveProperty(
        "lengthFeet",
      );
    }
    for (const crewSize of [0, -2, 9999, 2.5, Number.NaN, "6"]) {
      expect(sanitizeMaritimeDepth({ crewSize, vesselType: "workboat" })).not.toHaveProperty(
        "crewSize",
      );
    }
  });

  it("rounds a length to one decimal — as precise as a self-report gets", () => {
    expect(sanitizeMaritimeDepth({ lengthFeet: 41.678 })?.lengthFeet).toBe(41.7);
  });

  it("a date with no stated facts is not a report", () => {
    expect(sanitizeMaritimeDepth({ reportedAt: daysAgo(1) })).toBeUndefined();
  });

  it("returns undefined for garbage rather than an empty answer", () => {
    for (const junk of [null, undefined, 42, "maritime", [], { nonsense: true }]) {
      expect(sanitizeMaritimeDepth(junk)).toBeUndefined();
    }
  });

  it("drops an unparseable reportedAt but keeps the facts", () => {
    const out = sanitizeMaritimeDepth({ crewSize: 5, reportedAt: "last tuesday" });
    expect(out).toEqual({ crewSize: 5 });
  });

  it("accepts every declared vessel and berth type", () => {
    for (const vesselType of VESSEL_TYPES) {
      expect(sanitizeMaritimeDepth({ vesselType })?.vesselType).toBe(vesselType);
    }
    for (const berthType of BERTH_TYPES) {
      expect(sanitizeMaritimeDepth({ berthType })?.berthType).toBe(berthType);
    }
  });
});

describe("sanitizeCategoryDepth — the column shape", () => {
  it("keys surviving depth by its category", () => {
    expect(sanitizeCategoryDepth({ maritime: { crewSize: 6 } })).toEqual({
      maritime: { crewSize: 6 },
    });
  });

  it("returns {} — never a half-built claim — when nothing survives", () => {
    for (const junk of [null, undefined, 7, { maritime: null }, { maritime: { crewSize: 0 } }]) {
      expect(sanitizeCategoryDepth(junk)).toEqual({});
    }
  });

  it("drops category keys that are not real lanes", () => {
    // A blob naming a lane we never asked about is not a host claim we can show.
    const out = sanitizeCategoryDepth({
      maritime: { crewSize: 2 },
      farm: { livestock: true },
      submarine: { depth: 900 },
    });
    expect(out).toEqual({ maritime: { crewSize: 2 } });
  });

  it("is idempotent — re-sanitizing stored output changes nothing", () => {
    // This is what makes sanitize-on-READ safe to apply to every row forever.
    const once = sanitizeCategoryDepth({
      maritime: { vesselType: "sailing_yacht", lengthFeet: 52.3, berthAboard: true },
    });
    expect(sanitizeCategoryDepth(once)).toEqual(once);
  });
});

describe("hasCategoryDepth — the render gate", () => {
  it("is false when the host stated nothing", () => {
    expect(hasCategoryDepth({})).toBe(false);
    expect(hasCategoryDepth(undefined)).toBe(false);
  });

  it("is false for a date with no facts — that is not a report", () => {
    expect(hasCategoryDepth({ maritime: { reportedAt: daysAgo(2) } })).toBe(false);
  });

  it("is true for a single stated fact, including an explicit no", () => {
    expect(hasCategoryDepth({ maritime: { berthAboard: false } })).toBe(true);
    expect(hasCategoryDepth({ maritime: { crewSize: 3 } })).toBe(true);
  });
});

describe("categoryDepthFreshness — an undated report is not a fresh one", () => {
  it("derives freshness from the report date", () => {
    expect(categoryDepthFreshness(daysAgo(5), NOW)).toBe("fresh");
    expect(categoryDepthFreshness(daysAgo(200), NOW)).toBe("aging");
    expect(categoryDepthFreshness(daysAgo(400), NOW)).toBe("stale");
  });

  it("returns null for undated, unparseable, and future dates", () => {
    expect(categoryDepthFreshness(undefined, NOW)).toBeNull();
    expect(categoryDepthFreshness("whenever", NOW)).toBeNull();
    expect(categoryDepthFreshness(daysAgo(-10), NOW)).toBeNull();
  });
});
