/**
 * Listing-logistics contract — the honesty rules ARE the product here.
 *
 * What these pin:
 *  - ABSENCE IS "not stated": an unparseable/absent value produces NO KEY, so
 *    it renders "Not stated" and can never be inferred, defaulted, or ranked
 *    over. There is no sentinel value to accidentally write.
 *  - `available: false` ("no internet here") is a REAL stated answer and is
 *    distinguishable from absence — the whole reason a bare `wifi` chip is
 *    inadequate.
 *  - A listing can never simultaneously claim "no internet" and "50 Mbps".
 *  - Speeds are host self-reports, not measurements: implausible/garbage values
 *    are DROPPED (→ "Not stated") rather than clamped into a fake number.
 *  - Freshness is DERIVED, never stored, and an undated report is `null`
 *    (unknown age ≠ fresh).
 *
 * Pure contract logic — no DB, no mocks.
 */

import { describe, expect, it } from "vitest";

import {
  hasLogistics,
  logisticsFreshness,
  sanitizeConnectivity,
  sanitizeLogistics,
  LOGISTICS_AGING_DAYS,
  LOGISTICS_STALE_DAYS,
} from "@explore-and-earn/contracts";

const NOW = Date.parse("2026-07-16T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("sanitizeConnectivity — absence is 'not stated'", () => {
  it("keeps every field the host actually stated", () => {
    const out = sanitizeConnectivity({
      available: true,
      cost: "included",
      locations: ["housing", "worksite"],
      access: "shared",
      connectionType: "satellite",
      downloadMbps: 25,
      uploadMbps: 3,
      reliability: "intermittent",
      dataCapped: true,
      videoCallSuitable: false,
      reportedAt: daysAgo(10),
    });
    expect(out).toMatchObject({
      available: true,
      cost: "included",
      access: "shared",
      connectionType: "satellite",
      downloadMbps: 25,
      uploadMbps: 3,
      reliability: "intermittent",
      dataCapped: true,
      videoCallSuitable: false,
    });
    expect(out?.locations).toEqual(["housing", "worksite"]);
  });

  it("DROPS unknown enum values instead of guessing (→ not stated)", () => {
    const out = sanitizeConnectivity({
      available: true,
      cost: "free-ish",
      access: "semi-private",
      connectionType: "carrier-pigeon",
      reliability: "pretty good",
    });
    expect(out).toEqual({ available: true });
    // Each dropped key is ABSENT, not a sentinel — nothing to mistake for an answer.
    expect(out).not.toHaveProperty("cost");
    expect(out).not.toHaveProperty("connectionType");
  });

  it("distinguishes an explicit NO from silence", () => {
    // Explicitly no internet — a real, statable, useful answer.
    expect(sanitizeConnectivity({ available: false })).toEqual({ available: false });
    // Never asked — no key at all.
    expect(sanitizeConnectivity({})).toBeUndefined();
    expect(sanitizeConnectivity(null)).toBeUndefined();
    expect(sanitizeConnectivity("nope")).toBeUndefined();
  });

  it("cannot claim 'no internet' AND describe a connection", () => {
    const out = sanitizeConnectivity({
      available: false,
      downloadMbps: 50,
      connectionType: "fiber",
      videoCallSuitable: true,
    });
    expect(out).toEqual({ available: false });
  });

  it("drops implausible or garbage speeds rather than clamping to a fake number", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 99_999, "fast", null]) {
      const out = sanitizeConnectivity({ available: true, downloadMbps: bad });
      expect(out).toEqual({ available: true });
    }
  });

  it("rounds a self-reported speed to one decimal — no false precision", () => {
    expect(sanitizeConnectivity({ available: true, downloadMbps: 23.456 })?.downloadMbps).toBe(23.5);
  });

  it("dedupes locations and drops unknown ones", () => {
    const out = sanitizeConnectivity({
      available: true,
      locations: ["housing", "housing", "moon", "worksite"],
    });
    expect(out?.locations).toEqual(["housing", "worksite"]);
  });

  it("canonicalises location order, so a reordering is not a new answer", () => {
    // Same facts, stated in either order, must sanitise identically. A caller
    // comparing stored facts to decide whether the host RE-CONFIRMED them
    // would otherwise read a reordering as a change and stamp a fresh
    // reportedAt — claiming a confirmation that never happened.
    const a = sanitizeConnectivity({ available: true, locations: ["worksite", "housing"] });
    const b = sanitizeConnectivity({ available: true, locations: ["housing", "worksite"] });
    expect(a?.locations).toEqual(["housing", "worksite"]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("a date with no stated facts is not a report", () => {
    expect(sanitizeConnectivity({ reportedAt: daysAgo(1) })).toBeUndefined();
  });

  it("drops an invalid reportedAt but keeps the stated facts", () => {
    const out = sanitizeConnectivity({ available: true, reportedAt: "last tuesday" });
    expect(out).toEqual({ available: true });
  });
});

describe("sanitizeLogistics", () => {
  it("returns {} for anything unusable — never a half-built object", () => {
    for (const bad of [null, undefined, 42, "x", {}, { connectivity: {} }]) {
      expect(sanitizeLogistics(bad)).toEqual({});
    }
  });

  it("nests a surviving connectivity report", () => {
    expect(sanitizeLogistics({ connectivity: { available: false } })).toEqual({
      connectivity: { available: false },
    });
  });
});

describe("hasLogistics — gates the section", () => {
  it("is false when the host stated nothing", () => {
    expect(hasLogistics({})).toBe(false);
    expect(hasLogistics(null)).toBe(false);
    expect(hasLogistics({ connectivity: { reportedAt: daysAgo(1) } })).toBe(false);
  });

  it("is true for an explicit no-internet answer", () => {
    expect(hasLogistics({ connectivity: { available: false } })).toBe(true);
  });
});

describe("logisticsFreshness — derived, never stored", () => {
  it("is null when the report is undated — unknown age is not fresh", () => {
    expect(logisticsFreshness(null, NOW)).toBeNull();
    expect(logisticsFreshness(undefined, NOW)).toBeNull();
    expect(logisticsFreshness("not a date", NOW)).toBeNull();
  });

  it("ages a report at the policy boundaries", () => {
    expect(logisticsFreshness(daysAgo(1), NOW)).toBe("fresh");
    expect(logisticsFreshness(daysAgo(LOGISTICS_AGING_DAYS - 1), NOW)).toBe("fresh");
    expect(logisticsFreshness(daysAgo(LOGISTICS_AGING_DAYS), NOW)).toBe("aging");
    expect(logisticsFreshness(daysAgo(LOGISTICS_STALE_DAYS - 1), NOW)).toBe("aging");
    expect(logisticsFreshness(daysAgo(LOGISTICS_STALE_DAYS), NOW)).toBe("stale");
    expect(logisticsFreshness(daysAgo(1000), NOW)).toBe("stale");
  });

  it("treats a future date as no report rather than the freshest possible one", () => {
    expect(logisticsFreshness(new Date(NOW + 86_400_000).toISOString(), NOW)).toBeNull();
  });
});
