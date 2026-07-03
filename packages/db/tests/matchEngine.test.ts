/**
 * Unit tests for the ADR-040 matching engine (packages/db/src/lib/matchEngine.ts).
 *
 * The engine is pure and deterministic, so these tests need no DB, no env, and
 * no mocks. They pin the component math, the hard caps (ceilings), the
 * exclusions, confidence, band mapping, graceful degradation for thin profiles,
 * and the render-time explanation helpers (G34: reasons derived, never stored).
 */
import { describe, expect, it } from "vitest";

import { computeMatch } from "../src/lib/matchEngine";
import type { MatchListingInput, MatchSeekerInput } from "../src/lib/matchEngine";
import { scoreListingForSeeker } from "../src/lib/matchScore";
import {
  MATCH_SCORE_CAPS,
  matchReasonPhrase,
  topMatchReasons,
} from "@explore-and-earn/contracts";

const NOW = Date.parse("2026-06-01T00:00:00Z");

const baseListing: MatchListingInput = {
  category: "farm",
  tags: ["harvest", "orchard"],
  roles: ["farmhand"],
  requiredSkillTags: [],
  requiredCertifications: [],
  isRemote: false,
  locationDisplay: "Sonoma, CA",
  housingIncluded: true,
  mealsIncluded: true,
  compensationMinCents: 300_000,
  compensationMaxCents: 400_000,
  visaSupport: true,
  beginsAt: "2026-07-01T00:00:00Z",
  endsAt: "2026-09-01T00:00:00Z",
  status: "live",
  completionScore: 90,
};

const baseSeeker: MatchSeekerInput = {
  desiredCategories: ["farm"],
  desiredRoles: ["farmhand"],
  skillTags: ["harvest"],
  certifications: [],
  interestTags: ["orchard"],
  housingPreference: "required",
  mealsPreference: "preferred",
  locationPref: "on_site",
  travelReadiness: "ready_to_relocate",
  payExpectationMinCents: 300_000,
  payFlexible: false,
  availabilityStart: "2026-06-15T00:00:00Z",
  availabilityEnd: "2026-10-01T00:00:00Z",
  availabilityStatus: "date_range",
  visaSupportNeeded: false,
  completionScore: 85,
};

const listing = (over: Partial<MatchListingInput> = {}): MatchListingInput => ({
  ...baseListing,
  ...over,
});
const seeker = (over: Partial<MatchSeekerInput> = {}): MatchSeekerInput => ({
  ...baseSeeker,
  ...over,
});

describe("computeMatch — happy path", () => {
  it("scores a well-aligned pairing as a strong match", () => {
    const r = computeMatch(seeker(), listing(), { nowMs: NOW });
    expect(r.excluded).toBeNull();
    expect(r.capsApplied).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.band).toBe("strong");
    expect(r.rawScore).toBe(r.score); // no caps → equal
    // every component present and in range
    for (const v of Object.values(r.components)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(r.components.categoryRoleFit).toBeGreaterThanOrEqual(80);
    expect(r.components.payAlignment).toBe(100);
    expect(r.components.availabilityOverlap).toBe(100); // seeker window covers listing
  });

  it("is deterministic", () => {
    const a = computeMatch(seeker(), listing(), { nowMs: NOW });
    const b = computeMatch(seeker(), listing(), { nowMs: NOW });
    expect(a).toEqual(b);
  });
});

describe("caps — ceilings for unmet hard requirements", () => {
  it("caps at 65 when housing is required but not included", () => {
    const r = computeMatch(
      seeker({ housingPreference: "required" }),
      listing({ housingIncluded: false }),
      { nowMs: NOW },
    );
    expect(r.capsApplied).toContain("housingRequiredButNotIncluded");
    expect(r.score).toBeLessThanOrEqual(MATCH_SCORE_CAPS.housingRequiredButNotIncluded);
  });

  it("caps at 60 when a required certification is missing", () => {
    const r = computeMatch(
      seeker({ certifications: [] }),
      listing({ requiredCertifications: ["captains_license"] }),
      { nowMs: NOW },
    );
    expect(r.capsApplied).toContain("requiredCertificationMissing");
    expect(r.score).toBeLessThanOrEqual(60);
  });

  it("does NOT cap when the required certification is held", () => {
    const r = computeMatch(
      seeker({ certifications: ["Captains_License"] }), // case-insensitive
      listing({ requiredCertifications: ["captains_license"] }),
      { nowMs: NOW },
    );
    expect(r.capsApplied).not.toContain("requiredCertificationMissing");
  });

  it("caps at 50 on an impossible timeline conflict", () => {
    const r = computeMatch(
      seeker({
        availabilityStatus: "date_range",
        availabilityStart: "2026-01-01T00:00:00Z",
        availabilityEnd: "2026-03-01T00:00:00Z", // ends before listing begins
      }),
      listing(),
      { nowMs: NOW },
    );
    expect(r.components.availabilityOverlap).toBe(0);
    expect(r.capsApplied).toContain("impossibleTimelineConflict");
    expect(r.score).toBeLessThanOrEqual(50);
  });

  it("caps at 50 when visa support is needed but unavailable", () => {
    const r = computeMatch(
      seeker({ visaSupportNeeded: true }),
      listing({ visaSupport: false }),
      { nowMs: NOW },
    );
    expect(r.capsApplied).toContain("visaSupportRequiredButUnavailable");
    expect(r.score).toBeLessThanOrEqual(50);
  });

  it("applies the LOWEST ceiling when multiple caps fire", () => {
    const r = computeMatch(
      seeker({ housingPreference: "required", visaSupportNeeded: true }),
      listing({ housingIncluded: false, visaSupport: false }),
      { nowMs: NOW },
    );
    expect(r.capsApplied).toContain("housingRequiredButNotIncluded"); // 65
    expect(r.capsApplied).toContain("visaSupportRequiredButUnavailable"); // 50
    expect(r.score).toBeLessThanOrEqual(50); // min(65, 50)
  });
});

describe("exclusions — never scored/shown", () => {
  it("excludes a non-live listing", () => {
    const r = computeMatch(seeker(), listing({ status: "paused" }), { nowMs: NOW });
    expect(r.excluded).toBe("listing_not_live");
    expect(r.score).toBe(0);
  });

  it("labels archived/closed listings distinctly", () => {
    expect(computeMatch(seeker(), listing({ status: "archived" }), { nowMs: NOW }).excluded).toBe(
      "listing_closed_or_archived",
    );
  });

  it("excludes a blocked/restricted seeker", () => {
    const r = computeMatch(seeker({ blockedOrRestricted: true }), listing(), { nowMs: NOW });
    expect(r.excluded).toBe("seeker_blocked_or_restricted");
  });
});

describe("pay alignment", () => {
  it("is 100 when the offer meets the expectation", () => {
    const r = computeMatch(seeker({ payExpectationMinCents: 250_000 }), listing(), { nowMs: NOW });
    expect(r.components.payAlignment).toBe(100);
  });

  it("scales below expectation and softens when pay-flexible", () => {
    const strict = computeMatch(
      seeker({ payExpectationMinCents: 800_000, payFlexible: false }),
      listing({ compensationMinCents: 400_000, compensationMaxCents: 400_000 }),
      { nowMs: NOW },
    );
    const flexible = computeMatch(
      seeker({ payExpectationMinCents: 800_000, payFlexible: true }),
      listing({ compensationMinCents: 400_000, compensationMaxCents: 400_000 }),
      { nowMs: NOW },
    );
    expect(strict.components.payAlignment).toBeLessThan(100);
    expect(flexible.components.payAlignment).toBeGreaterThan(strict.components.payAlignment);
  });

  it("is neutral (70) when the seeker states no pay expectation", () => {
    const r = computeMatch(seeker({ payExpectationMinCents: null }), listing(), { nowMs: NOW });
    expect(r.components.payAlignment).toBe(70);
  });
});

describe("graceful degradation", () => {
  it("still scores a thin profile (not excluded) with lower confidence", () => {
    const thin = computeMatch(
      {
        desiredCategories: [],
        housingPreference: null,
        locationPref: null,
        availabilityStatus: null,
      },
      listing(),
      { nowMs: NOW },
    );
    const rich = computeMatch(seeker(), listing(), { nowMs: NOW });
    expect(thin.excluded).toBeNull();
    expect(thin.confidence).toBeLessThan(rich.confidence);
    expect(thin.components.categoryRoleFit).toBe(45); // neutral-unknown, not 0
  });
});

describe("render-time explanation (G34)", () => {
  it("surfaces the top contributing components as reasons", () => {
    const r = computeMatch(seeker(), listing(), { nowMs: NOW });
    const reasons = topMatchReasons(r.components);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(2);
    const phrase = matchReasonPhrase(r.components);
    expect(phrase).toMatch(/^Strong on /);
  });

  it("returns no phrase when no component is strong", () => {
    const weak = {
      categoryRoleFit: 10,
      locationTravelFit: 10,
      availabilityOverlap: 10,
      payAlignment: 10,
      housingMealsFit: 10,
      profileCompleteness: 10,
    };
    expect(matchReasonPhrase(weak)).toBeNull();
  });
});

describe("legacy scoreListingForSeeker delegation", () => {
  it("returns a 0-100 score and rewards category alignment", () => {
    const aligned = scoreListingForSeeker(
      { category: "farm", housingIncluded: true, compensationMinCents: 300_000, locationDisplay: "CA" },
      { desiredCategories: ["farm"], housingPreference: "required", locationPref: "on_site", payExpectationMin: 2000 },
    );
    const misaligned = scoreListingForSeeker(
      { category: "maritime", housingIncluded: false, compensationMinCents: 100_000, locationDisplay: "CA" },
      { desiredCategories: ["farm"], housingPreference: "required", locationPref: "on_site", payExpectationMin: 2000 },
    );
    expect(aligned).toBeGreaterThanOrEqual(0);
    expect(aligned).toBeLessThanOrEqual(100);
    expect(aligned).toBeGreaterThan(misaligned);
  });
});
