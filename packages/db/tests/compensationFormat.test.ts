/**
 * The pay string, across every shape a listing row can be in.
 *
 * PAY IS PER LISTING (founder, 2026-07-26): a floor reads "From $X", a range
 * reads as the range, and silence reads as silence. The word "Negotiable" used
 * to stand in for the last case — an empty column rendered as a claim about
 * what the host would do. These tests exist so it cannot come back.
 *
 * Lives in packages/db because @explore-and-earn/contracts has no test runner
 * of its own and packages/db already depends on it. Nothing here touches the
 * database or `server-only`.
 */

import { describe, expect, it } from "vitest";

import {
  formatCompensation,
  NOT_STATED_LABEL,
} from "@explore-and-earn/contracts";

describe("formatCompensation — the three founder cases", () => {
  it("a floor with no ceiling reads as a floor", () => {
    expect(formatCompensation({ minCents: 150_000, maxCents: null })).toBe(
      "From $1,500",
    );
  });

  it("a stated range reads as the range, never as a floor", () => {
    const result = formatCompensation({ minCents: 120_000, maxCents: 150_000 });
    expect(result).toBe("$1,200–$1,500");
    expect(result).not.toContain("From");
  });

  it("nothing stated does NOT say Negotiable", () => {
    const result = formatCompensation({
      summary: null,
      minCents: null,
      maxCents: null,
    });
    expect(result).toBe(NOT_STATED_LABEL);
    expect(result).not.toMatch(/negotiable/i);
  });

  it("does not substitute any other friendly stand-in for silence", () => {
    // "See listing", "Ask the host", "Competitive" are inventions too. The only
    // honest output for an unanswered column is the canonical not-stated label.
    const result = formatCompensation({});
    expect(result).toBe(NOT_STATED_LABEL);
  });
});

describe("formatCompensation — the shapes around the edges", () => {
  it("an exact figure (min === max) is NOT prefixed with From", () => {
    // A floor and a ceiling that agree is a number, not a starting point.
    expect(formatCompensation({ minCents: 150_000, maxCents: 150_000 })).toBe(
      "$1,500",
    );
  });

  it("a ceiling with no floor reads as a ceiling, not as silence", () => {
    // 070's triad CHECK accepts `coalesce(max,0) > 0` with a null min, so this
    // row can be published. Falling through to "Not stated" would hide a figure
    // the host DID state.
    expect(formatCompensation({ minCents: null, maxCents: 150_000 })).toBe(
      "Up to $1,500",
    );
  });

  it("host-authored summary text still wins over every derived form", () => {
    expect(
      formatCompensation({ summary: "$18/hr plus tips", minCents: 150_000 }),
    ).toBe("$18/hr plus tips");
  });

  it("appends the pay period to a floor", () => {
    expect(
      formatCompensation({ minCents: 150_000, unit: "month" }),
    ).toBe("From $1,500/month");
  });

  it("drops the period for non-cash units, as the discovery card always did", () => {
    for (const unit of ["other", "exchange", "stipend"]) {
      expect(formatCompensation({ minCents: 150_000, unit })).toBe("From $1,500");
    }
  });

  it("honours an explicit currency", () => {
    expect(
      formatCompensation({ minCents: 150_000, currency: "EUR" }),
    ).toBe("From €1,500");
  });
});

describe("formatCompensation — the admin console's overrides still apply", () => {
  const ADMIN = {
    fallback: "Unpaid / exchange",
    singleValuePrefix: "From ",
    suffixMode: "always",
    collapseEqualRange: false,
  } as const;

  it("keeps an equal-value range expanded", () => {
    expect(
      formatCompensation({ minCents: 150_000, maxCents: 150_000 }, ADMIN),
    ).toBe("$1,500–$1,500");
  });

  it("keeps its own fallback for a row with no figure at all", () => {
    expect(formatCompensation({}, ADMIN)).toBe("Unpaid / exchange");
  });

  it("appends the period even for a non-cash unit", () => {
    expect(
      formatCompensation({ minCents: 150_000, unit: "stipend" }, ADMIN),
    ).toBe("From $1,500/stipend");
  });
});
