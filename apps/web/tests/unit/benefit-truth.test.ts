/**
 * The host's benefit decision, at the ACTION boundary.
 *
 * This is where the original bug lived: the action layer never read a provision
 * at all, so the writer's "no provision supplied" fallback fired on every save
 * and inferred the answer from whether the description textarea had text. A
 * host with nothing to write shipped "Housing: Not included" — confirmed —
 * for a question they never answered.
 *
 * The rules pinned here:
 *  - "" (the host saw the control and didn't answer) must SURVIVE as
 *    `not_stated`. Collapsing it to undefined re-opens the hole, because
 *    undefined means "leave the column alone".
 *  - An absent key still means "not submitted — don't touch the column".
 *  - Junk is never guessed into a decision.
 */

import { describe, expect, it } from "vitest";

import { HOST_BENEFIT_CHOICES, type BenefitProvision } from "@explore-and-earn/contracts";

/**
 * Mirrors benefitChoice() in apps/web/app/actions/listings.ts.
 *
 * The action module is "server-only" and pulls in Clerk + the whole db package,
 * so it cannot be imported here (apps/web vitest is environment: node). This
 * suite pins the RULE; the shape is small enough to state exactly, and the
 * contract it depends on (HOST_BENEFIT_CHOICES) is imported for real — so if
 * the vocabulary changes underneath, this fails.
 */
function benefitChoice(formData: FormData, key: string): BenefitProvision | undefined {
  if (!formData.has(key)) return undefined;
  const raw = formData.get(key);
  if (typeof raw !== "string") return "not_stated";
  const trimmed = raw.trim();
  return (HOST_BENEFIT_CHOICES as readonly string[]).includes(trimmed)
    ? (trimmed as BenefitProvision)
    : "not_stated";
}

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("benefitChoice — a blank answer is a fact, not a missing field", () => {
  it("keeps an EMPTY submitted choice as not_stated", () => {
    // The rule the whole fix rests on. If "" collapsed to undefined the writer
    // would skip the column, a stale "Not included" would survive the save, and
    // the host would have no way to un-answer.
    expect(benefitChoice(fd({ housingProvision: "" }), "housingProvision")).toBe("not_stated");
  });

  it("returns undefined only when the key was never submitted", () => {
    // Distinct from "" on purpose: not submitted = leave the column untouched,
    // which is the convention every other field in this action follows.
    expect(benefitChoice(fd({}), "housingProvision")).toBeUndefined();
  });

  it("passes through the two real host choices", () => {
    expect(benefitChoice(fd({ housingProvision: "provided" }), "housingProvision")).toBe("provided");
    expect(benefitChoice(fd({ housingProvision: "not_provided" }), "housingProvision")).toBe(
      "not_provided",
    );
  });

  it("never guesses a decision from junk", () => {
    for (const junk of ["yes", "true", "NOT_PROVIDED", "partial-ish", "  "]) {
      expect(benefitChoice(fd({ housingProvision: junk }), "housingProvision")).toBe("not_stated");
    }
  });

  it("refuses to let a host pick not_stated directly", () => {
    // not_stated is a state a listing can be IN, never a state a host picks —
    // otherwise "unanswered" becomes a publishable answer.
    expect(HOST_BENEFIT_CHOICES).not.toContain("not_stated");
    expect(benefitChoice(fd({ housingProvision: "not_stated" }), "housingProvision")).toBe(
      "not_stated",
    );
  });
});

describe("the vocabulary a host may choose from", () => {
  it("is exactly yes and no", () => {
    expect([...HOST_BENEFIT_CHOICES]).toEqual(["provided", "not_provided"]);
  });
});
