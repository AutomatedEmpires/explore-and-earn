/**
 * Unit tests for the match trace builder (packages/db/src/lib/matchTrace.ts).
 *
 * The trace is the structured explanation contract: every signal must derive
 * from the SAME inputs the ADR-040 engine scored, blockers must map 1:1 to
 * applied caps, missing data must surface as `missing` (never fabricated
 * evidence), and the numeric fields must equal computeMatch's result exactly.
 */
import { describe, expect, it } from "vitest";

import { computeMatch } from "../src/lib/matchEngine";
import type { MatchListingInput, MatchSeekerInput } from "../src/lib/matchEngine";
import { buildMatchTrace } from "../src/lib/matchTrace";
import {
  CAP_SIGNAL_CODES,
  MATCH_SIGNAL_CODES,
  orderedTraceSignals,
  renderMatchSignal,
  renderMatchTrace,
  type MatchSignal,
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

const codes = (signals: readonly MatchSignal[]): string[] =>
  signals.map((s) => s.code);

describe("buildMatchTrace — consistency with the engine", () => {
  it("numeric fields equal computeMatch exactly", () => {
    const trace = buildMatchTrace(seeker(), listing(), { nowMs: NOW });
    const result = computeMatch(seeker(), listing(), { nowMs: NOW });
    expect(trace.score).toBe(result.score);
    expect(trace.rawScore).toBe(result.rawScore);
    expect(trace.band).toBe(result.band);
    expect(trace.confidence).toBe(result.confidence);
    expect(trace.components).toEqual(result.components);
    expect(trace.capsApplied).toEqual(result.capsApplied);
    expect(trace.excluded).toBeNull();
  });

  it("is deterministic for the same inputs and clock", () => {
    const a = buildMatchTrace(seeker(), listing(), { nowMs: NOW });
    const b = buildMatchTrace(seeker(), listing(), { nowMs: NOW });
    expect(a).toEqual(b);
  });

  it("every applied cap surfaces exactly one blocker signal", () => {
    const trace = buildMatchTrace(
      seeker({
        housingPreference: "required",
        visaSupportNeeded: true,
        certifications: [],
      }),
      listing({
        housingIncluded: false,
        visaSupport: false,
        requiredCertifications: ["usgc-deckhand"],
      }),
      { nowMs: NOW },
    );
    const blockers = trace.signals.filter((s) => s.polarity === "blocker");
    expect(blockers).toHaveLength(trace.capsApplied.length);
    expect(new Set(codes(blockers))).toEqual(
      new Set(trace.capsApplied.map((cap) => CAP_SIGNAL_CODES[cap])),
    );
  });

  it("emits only registered signal codes", () => {
    const trace = buildMatchTrace(seeker(), listing(), { nowMs: NOW });
    for (const signal of trace.signals) {
      expect(MATCH_SIGNAL_CODES).toContain(signal.code);
    }
  });

  it("excluded pairings carry no signals", () => {
    const trace = buildMatchTrace(seeker(), listing({ status: "closed" }), {
      nowMs: NOW,
    });
    expect(trace.excluded).toBe("listing_closed_or_archived");
    expect(trace.signals).toEqual([]);
  });
});

describe("buildMatchTrace — positive evidence", () => {
  it("surfaces category preference, role overlap, and covered skills", () => {
    const trace = buildMatchTrace(
      seeker({ skillTags: ["harvest", "tractor"] }),
      listing({ requiredSkillTags: ["harvest", "tractor"] }),
      { nowMs: NOW },
    );
    const c = codes(trace.signals);
    expect(c).toContain("category_preferred");
    expect(c).toContain("roles_overlap");
    expect(c).toContain("required_skills_covered");
    const skills = trace.signals.find((s) => s.code === "required_skills_covered");
    expect(skills?.params).toEqual({ total: 2 });
    expect(skills?.polarity).toBe("positive");
  });

  it("surfaces housing/meals/pay fits with correct polarity", () => {
    const trace = buildMatchTrace(seeker(), listing(), { nowMs: NOW });
    const c = codes(trace.signals);
    expect(c).toContain("housing_included_matches_need");
    expect(c).toContain("meals_included_matches_need");
    expect(c).toContain("pay_meets_expectation");
    for (const code of [
      "housing_included_matches_need",
      "meals_included_matches_need",
      "pay_meets_expectation",
    ]) {
      expect(trace.signals.find((s) => s.code === code)?.polarity).toBe("positive");
    }
  });

  it("full availability coverage reports the season length", () => {
    const trace = buildMatchTrace(seeker(), listing(), { nowMs: NOW });
    const availability = trace.signals.find(
      (s) => s.code === "availability_overlaps_season",
    );
    expect(availability).toBeDefined();
    expect(availability?.params?.overlapDays).toBe(62); // Jul 1 → Sep 1
  });

  it("partial availability reports the overlap percentage", () => {
    const trace = buildMatchTrace(
      seeker({
        availabilityStart: "2026-07-01T00:00:00Z",
        availabilityEnd: "2026-08-01T00:00:00Z", // half the season
      }),
      listing(),
      { nowMs: NOW },
    );
    const partial = trace.signals.find(
      (s) => s.code === "availability_partial_overlap",
    );
    expect(partial).toBeDefined();
    expect(partial?.params?.overlapPercent).toBe(50);
    expect(partial?.polarity).toBe("positive"); // >= 50%
  });
});

describe("buildMatchTrace — negative evidence and honesty", () => {
  it("category outside preferences is negative, never hidden", () => {
    const trace = buildMatchTrace(
      seeker({ desiredCategories: ["maritime"], desiredRoles: [] }),
      listing({ category: "farm" }),
      { nowMs: NOW },
    );
    expect(trace.excluded).toBeNull(); // low fit ≠ hidden
    const signal = trace.signals.find((s) => s.code === "category_not_preferred");
    expect(signal?.polarity).toBe("negative");
    expect(signal?.params).toEqual({ category: "farm" });
  });

  it("pay below expectation carries the real percentage", () => {
    const trace = buildMatchTrace(
      seeker({ payExpectationMinCents: 800_000 }),
      listing({ compensationMinCents: 300_000, compensationMaxCents: 400_000 }),
      { nowMs: NOW },
    );
    const pay = trace.signals.find((s) => s.code === "pay_below_expectation");
    expect(pay?.polarity).toBe("negative");
    expect(pay?.params?.payPercent).toBe(50);
  });

  it("remote-only seeker vs on-site listing is negative evidence", () => {
    const trace = buildMatchTrace(
      seeker({ travelReadiness: "remote_only" }),
      listing(),
      { nowMs: NOW },
    );
    expect(codes(trace.signals)).toContain("onsite_conflicts_remote_only");
  });
});

describe("buildMatchTrace — missing data reduces certainty, never fabricates", () => {
  it("no availability dates → availability_unknown (missing), not evidence", () => {
    const trace = buildMatchTrace(
      seeker({
        availabilityStart: null,
        availabilityEnd: null,
        availabilityStatus: "date_range",
      }),
      listing(),
      { nowMs: NOW },
    );
    const c = codes(trace.signals);
    expect(c).toContain("availability_unknown");
    expect(c).not.toContain("availability_overlaps_season");
    expect(
      trace.signals.find((s) => s.code === "availability_unknown")?.polarity,
    ).toBe("missing");
  });

  it("no pay expectation → missing note, no fabricated pay fit", () => {
    const trace = buildMatchTrace(
      seeker({ payExpectationMinCents: null }),
      listing(),
      { nowMs: NOW },
    );
    const c = codes(trace.signals);
    expect(c).toContain("pay_expectation_missing");
    expect(c).not.toContain("pay_meets_expectation");
    expect(c).not.toContain("pay_below_expectation");
  });

  it("listing without pay → pay_unknown (missing)", () => {
    const trace = buildMatchTrace(
      seeker(),
      listing({ compensationMinCents: null, compensationMaxCents: null }),
      { nowMs: NOW },
    );
    expect(codes(trace.signals)).toContain("pay_unknown");
  });

  it("empty preferences → missing category note", () => {
    const trace = buildMatchTrace(
      seeker({ desiredCategories: [], desiredRoles: [] }),
      listing(),
      { nowMs: NOW },
    );
    expect(codes(trace.signals)).toContain("category_preference_missing");
  });

  it("thin profile adds the low-confidence note", () => {
    const thin: MatchSeekerInput = {
      desiredCategories: [],
      housingPreference: null,
      locationPref: null,
    };
    const trace = buildMatchTrace(thin, listing(), { nowMs: NOW });
    expect(trace.components.profileCompleteness).toBeLessThan(40);
    expect(codes(trace.signals)).toContain("profile_thin");
  });
});

describe("trace rendering (G34: render-time only)", () => {
  it("renders seeker and host copy from the same signal", () => {
    const signal: MatchSignal = {
      code: "housing_included_matches_need",
      component: "housingMealsFit",
      polarity: "positive",
    };
    expect(renderMatchSignal(signal, "seeker")).toBe(
      "Housing is included, matching your stated preference.",
    );
    expect(renderMatchSignal(signal, "host")).toBe(
      "Included housing matches their stated housing need.",
    );
  });

  it("interpolates params into copy", () => {
    const signal: MatchSignal = {
      code: "required_skills_partial",
      component: "categoryRoleFit",
      polarity: "weak",
      params: { covered: 1, total: 3 },
    };
    expect(renderMatchSignal(signal, "seeker")).toContain("1 of the 3 skills");
  });

  it("orders blockers before positives before missing", () => {
    const trace = buildMatchTrace(
      seeker({ housingPreference: "required", payExpectationMinCents: null }),
      listing({ housingIncluded: false }),
      { nowMs: NOW },
    );
    const ordered = orderedTraceSignals(trace);
    expect(ordered[0]?.polarity).toBe("blocker");
    const lines = renderMatchTrace(trace, "seeker");
    expect(lines[0]).toBe(
      "You require housing, but this listing doesn't include it.",
    );
  });

  it("renderMatchTrace surfaces every blocker even beyond the supporting cap", () => {
    const trace = buildMatchTrace(
      seeker({
        housingPreference: "required",
        visaSupportNeeded: true,
      }),
      listing({
        housingIncluded: false,
        visaSupport: false,
        requiredCertifications: ["captain-license"],
      }),
      { nowMs: NOW },
    );
    const lines = renderMatchTrace(trace, "seeker", 1);
    const blockerCount = trace.signals.filter((s) => s.polarity === "blocker").length;
    expect(blockerCount).toBe(3);
    expect(lines.length).toBe(blockerCount + 1);
  });
});
