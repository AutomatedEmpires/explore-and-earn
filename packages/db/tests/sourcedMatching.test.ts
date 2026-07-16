/**
 * Adversarial tests for Matching v2 over SOURCED inventory
 * (packages/db/src/lib/matchEngine.ts benefit-evidence handling).
 *
 * The charter's hardest rule: a not_stated benefit must NEVER rank as provided,
 * and must never be penalized as a hard "not included" either — it is UNKNOWN.
 * These pin that a sourced listing with unstated housing/meals can't beat an
 * equivalent confirmed listing that actually provides them, and can't be
 * falsely capped as if it lacked a required benefit.
 */
import { describe, expect, it } from "vitest";

import { computeMatch } from "../src/lib/matchEngine";
import type { MatchListingInput, MatchSeekerInput } from "../src/lib/matchEngine";

const NOW = Date.parse("2026-06-01T00:00:00Z");

const seeker = (over: Partial<MatchSeekerInput> = {}): MatchSeekerInput => ({
  desiredCategories: ["farm"],
  housingPreference: "preferred",
  mealsPreference: "preferred",
  locationPref: "on_site",
  payExpectationMinCents: 200_000,
  ...over,
});

const listing = (over: Partial<MatchListingInput> = {}): MatchListingInput => ({
  category: "farm",
  housingIncluded: true,
  mealsIncluded: true,
  compensationMinCents: 300_000,
  compensationMaxCents: 300_000,
  status: "live",
  ...over,
});

describe("not_stated benefits are UNKNOWN, never a false positive", () => {
  it("a not_stated housing benefit never scores as high as confirmed-provided housing", () => {
    const confirmed = computeMatch(
      seeker(),
      listing({ housingIncluded: true, housingEvidence: "confirmed" }),
      { nowMs: NOW },
    );
    // Sourced listing: the value column is false + evidence not_stated.
    const notStated = computeMatch(
      seeker(),
      listing({ housingIncluded: false, housingEvidence: "not_stated" }),
      { nowMs: NOW },
    );
    expect(notStated.components.housingMealsFit).toBeLessThan(
      confirmed.components.housingMealsFit,
    );
  });

  it("a not_stated housing benefit is NOT scored as a hard 'not included' either", () => {
    // Confirmed-absent housing for a seeker who prefers it scores low (55);
    // not_stated must score HIGHER than that (unknown ≠ absent) …
    const absent = computeMatch(
      seeker({ mealsPreference: null }),
      listing({ housingIncluded: false, housingEvidence: "confirmed", mealsIncluded: null }),
      { nowMs: NOW },
    );
    const unknown = computeMatch(
      seeker({ mealsPreference: null }),
      listing({ housingIncluded: false, housingEvidence: "not_stated", mealsIncluded: null }),
      { nowMs: NOW },
    );
    expect(unknown.components.housingMealsFit).toBeGreaterThan(
      absent.components.housingMealsFit,
    );
    // … and LOWER than genuinely provided housing.
    const provided = computeMatch(
      seeker({ mealsPreference: null }),
      listing({ housingIncluded: true, housingEvidence: "confirmed", mealsIncluded: null }),
      { nowMs: NOW },
    );
    expect(unknown.components.housingMealsFit).toBeLessThan(
      provided.components.housingMealsFit,
    );
  });
});

describe("honesty caps never fire on unknown benefits", () => {
  it("housing REQUIRED does NOT cap a not_stated sourced listing (we don't know it's absent)", () => {
    const req = seeker({ housingPreference: "required", mealsPreference: null });
    const notStated = computeMatch(
      req,
      listing({ housingIncluded: false, housingEvidence: "not_stated", mealsIncluded: null }),
      { nowMs: NOW },
    );
    expect(notStated.capsApplied).not.toContain("housingRequiredButNotIncluded");
  });

  it("housing REQUIRED still caps a confirmed-absent listing (real hard incompatibility)", () => {
    const req = seeker({ housingPreference: "required", mealsPreference: null });
    const absent = computeMatch(
      req,
      listing({ housingIncluded: false, housingEvidence: "confirmed", mealsIncluded: null }),
      { nowMs: NOW },
    );
    expect(absent.capsApplied).toContain("housingRequiredButNotIncluded");
  });
});

describe("sourced inventory stays eligible and honestly ranked", () => {
  it("a strong sourced listing is not excluded and can still rank well", () => {
    const result = computeMatch(
      seeker({ housingPreference: null, mealsPreference: null }),
      listing({
        housingIncluded: false,
        housingEvidence: "not_stated",
        mealsIncluded: null,
        mealsEvidence: "not_stated",
      }),
      { nowMs: NOW },
    );
    expect(result.excluded).toBeNull(); // sourced inventory is real inventory
    expect(result.score).toBeGreaterThan(0);
  });

  it("unstated pay stays neutral-unknown, never a fabricated positive", () => {
    const withPay = computeMatch(seeker(), listing({ compensationMinCents: 300_000 }), { nowMs: NOW });
    const noPay = computeMatch(
      seeker(),
      listing({ compensationMinCents: null, compensationMaxCents: null }),
      { nowMs: NOW },
    );
    // No stated pay must not beat a listing that clears the seeker's expectation.
    expect(noPay.components.payAlignment).toBeLessThan(withPay.components.payAlignment);
  });
});
