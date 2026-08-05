import { describe, expect, it } from "vitest";

import {
  benefitStateLabel,
  NOT_STATED_LABEL,
  payStateLabel,
  type BenefitEvidenceStatus,
} from "@explore-and-earn/contracts";

/**
 * "Absence is never a no" (UX review 2026-07-23).
 *
 * The defect this pins: the listing detail page's fallback OG/SEO description
 * read the raw housingIncluded/mealsIncluded booleans and published "Housing
 * not included" for listings whose source never stated it — while the visible
 * triad on the same page correctly said "Not stated". Two renderers, one fact,
 * two different public answers.
 *
 * The wording now lives in contracts so it cannot diverge again.
 */

const EVIDENCE: readonly BenefitEvidenceStatus[] = [
  "not_stated",
  "stated",
  "confirmed",
];

describe("benefitStateLabel", () => {
  it("says 'Not stated' when the source never said, regardless of the boolean", () => {
    expect(benefitStateLabel(false, "not_stated")).toBe(NOT_STATED_LABEL);
    // The boolean defaults to false in the DB, so this is the real trap: a
    // `true` here must still not be read as a claim.
    expect(benefitStateLabel(true, "not_stated")).toBe(NOT_STATED_LABEL);
  });

  it("reports a stated benefit plainly", () => {
    expect(benefitStateLabel(true, "stated")).toBe("Included");
    expect(benefitStateLabel(false, "stated")).toBe("Not included");
    expect(benefitStateLabel(true, "confirmed")).toBe("Included");
  });

  it("treats absent evidence as a host-confirmed listing (unchanged behaviour)", () => {
    expect(benefitStateLabel(true, undefined)).toBe("Included");
    expect(benefitStateLabel(false, undefined)).toBe("Not included");
  });

  it("lowercases for prose without changing the meaning", () => {
    expect(benefitStateLabel(false, "not_stated", { lowercase: true })).toBe(
      "not stated",
    );
    expect(benefitStateLabel(false, "stated", { lowercase: true })).toBe(
      "not included",
    );
  });

  /**
   * The negative control: no evidence value may ever turn silence into a
   * negative claim, and "not stated" must never be confused with "not
   * included" — they are different facts and the whole product rests on it.
   */
  it("NEVER renders 'not included' for unstated evidence", () => {
    for (const included of [true, false]) {
      for (const lowercase of [true, false]) {
        const label = benefitStateLabel(included, "not_stated", { lowercase });
        expect(label.toLowerCase()).not.toBe("not included");
        expect(label.toLowerCase()).toBe("not stated");
      }
    }
    // ...and every OTHER evidence value must still produce a real answer.
    for (const evidence of EVIDENCE.filter((e) => e !== "not_stated")) {
      expect(benefitStateLabel(true, evidence)).not.toBe(NOT_STATED_LABEL);
    }
  });
});

describe("payStateLabel", () => {
  it("uses the evidence state instead of a stale parsed value", () => {
    expect(payStateLabel("$21/hr", "not_stated")).toBe(NOT_STATED_LABEL);
  });

  it.each(["stated", "confirmed", undefined] as const)(
    "keeps formatted pay for %s evidence",
    (evidence) => {
      expect(payStateLabel("From $21/hr", evidence)).toBe("From $21/hr");
    },
  );
});
