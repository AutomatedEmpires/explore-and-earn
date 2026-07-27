/**
 * A SELF-TEST FOR G53, because a guardrail nobody drives is a guardrail nobody
 * knows is running.
 *
 * G53 v1 banned the early-host programme's language outright, which was right
 * while the programme was a term sheet with no code path. v2 replaces the ban
 * with a narrower rule aimed at what was actually wrong — numbers with nothing
 * behind them:
 *
 *   (a) the language is allowed ONLY in the allow-listed surfaces;
 *   (b) an allow-listed surface that states a capacity, a count, a remainder or
 *       a deadline must read it from the configured row;
 *   (c) nothing anywhere may reference the contract's DEFAULT seat cap, because
 *       the live capacity is whatever the founder configured and a default
 *       rendered beside it states two numbers for one fact.
 *
 * Every one of those is asserted in BOTH directions. A rule that has only ever
 * been run over a passing tree cannot be told apart from one that has silently
 * stopped checking — which is exactly how a guardrail rots.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ALLOWED_FOUNDING_FILES,
  evaluateFoundingClaims,
} from "../../../../tools/scripts/check-founding-host-claims.mjs";

const ORDINARY_FILE = "apps/web/components/home/HostPitch.tsx";
const PROGRAM_MODULE = "apps/web/components/founding/program.ts";
const PUBLIC_SECTION = "apps/web/components/founding/FoundingHostSection.tsx";

describe("G53 rule (a): the language stays confined", () => {
  it.each([
    ["a programme claim", "Join the founding host programme today."],
    ["a limited-count promise", "Only for the first 100 paying hosts."],
    ["a lifetime lock", "Your rate is locked for life."],
    ["a tier-change guarantee", "The discount survives a tier change."],
    [
      "a forfeiture term",
      "The discount is forfeited if you cancel your subscription.",
    ],
    ["the contract symbol", "import { FOUNDING_LOCKED_PRICING } from 'x';"],
  ])("still refuses %s in an ordinary file", (_label, content) => {
    expect(evaluateFoundingClaims(ORDINARY_FILE, content)).not.toHaveLength(0);
  });

  it("permits the same language on an allow-listed surface that reads the row", () => {
    const content = [
      'import { resolveFoundingProgramView } from "./program";',
      "// Join the founding host programme. The rate is locked for life.",
      "const remaining = view.counts?.remaining;",
    ].join("\n");

    expect(evaluateFoundingClaims(PUBLIC_SECTION, content)).toEqual([]);
  });

  /** The negative control for the allow-list itself. */
  it("keeps ordinary files clean of the language even when they read the row", () => {
    const content = [
      'import { getFoundingHostProgram } from "@explore-and-earn/db";',
      "// Join the founding host programme.",
    ].join("\n");

    expect(evaluateFoundingClaims(ORDINARY_FILE, content)).not.toHaveLength(0);
  });
});

describe("G53 rule (b): a figure must come from the configured row", () => {
  it("REFUSES a capacity on an allow-listed surface that reads no row", () => {
    const violations = evaluateFoundingClaims(
      PUBLIC_SECTION,
      "const capacity = 100;\nexport const x = capacity;",
    );
    expect(violations.join(" ")).toContain("without reading the configured row");
  });

  it.each([
    ["capacity", "const capacity = 100;"],
    ["claimed", "const claimed = 7;"],
    ["remaining", "const remaining = 93;"],
    ["a deadline", "const deadlineIso = '2026-09-01';"],
  ])("REFUSES a hardcoded %s", (_label, content) => {
    expect(evaluateFoundingClaims(PUBLIC_SECTION, content)).not.toHaveLength(0);
  });

  it("accepts the same figures once the surface goes through the config module", () => {
    const content = [
      'import { resolveFoundingProgramView } from "../founding/program";',
      "const { capacity, claimed, remaining } = view.counts;",
    ].join("\n");

    expect(evaluateFoundingClaims(PUBLIC_SECTION, content)).toEqual([]);
  });

  /** The config module IS the row's reader, so it is exempt from (b). */
  it("exempts the config module itself", () => {
    const content = "export interface X { capacity: number; claimed: number }";
    expect(evaluateFoundingClaims(PROGRAM_MODULE, content)).toEqual([]);
  });

  /**
   * The admin page and its action legitimately handle the raw configuration
   * rather than the public view, so touching the row accessors is proof enough.
   */
  it("accepts the admin write path via the row writer", () => {
    const content = [
      'import { upsertFoundingHostProgram } from "@explore-and-earn/db";',
      "export async function save(capacity: number) {}",
    ].join("\n");

    expect(
      evaluateFoundingClaims("apps/web/app/actions/foundingProgram.ts", content),
    ).toEqual([]);
  });
});

describe("G53 rule (c): the contract default is never the live capacity", () => {
  it.each([ORDINARY_FILE, PUBLIC_SECTION, PROGRAM_MODULE])(
    "refuses the default seat cap in %s",
    (path) => {
      const violations = evaluateFoundingClaims(
        path,
        "const cap = FOUNDING_SEAT_CAP;",
      );
      expect(violations.join(" ")).toContain(
        "default seat cap is not the live capacity",
      );
    },
  );
});

describe("the allow-list names files that exist", () => {
  it("points at real surfaces, so a rename cannot silently widen the rule", () => {
    expect(ALLOWED_FOUNDING_FILES.size).toBeGreaterThan(0);
    for (const relativePath of ALLOWED_FOUNDING_FILES) {
      const url = new URL(`../../../../${relativePath}`, import.meta.url);
      expect(
        () => readFileSync(url, "utf8"),
        `allow-listed file is missing: ${relativePath}`,
      ).not.toThrow();
    }
  });
});
