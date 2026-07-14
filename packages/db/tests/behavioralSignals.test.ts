/**
 * Unit tests for behavioral reorder signals
 * (packages/db/src/lib/behavioralSignals.ts).
 *
 * Pins the charter invariants: bounded, decay-aware, resistant to a single
 * accidental interaction, cold-start safe, reorder-only (the fit score is
 * untouched — callers combine via personalizedOrderingScore), and deterministic.
 */
import { describe, expect, it } from "vitest";

import {
  BEHAVIOR_ACTIVATION_EVIDENCE,
  BEHAVIOR_HALF_LIFE_DAYS,
  BEHAVIOR_MAX_ADJUST,
  behavioralAdjustment,
  computeBehaviorProfile,
  EMPTY_BEHAVIOR_PROFILE,
  personalizedOrderingScore,
  type BehaviorInteraction,
} from "../src/lib/behavioralSignals";

const NOW = Date.parse("2026-07-01T00:00:00Z");
const DAY = 86_400_000;

const at = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();

const save = (category: string, daysAgo = 0): BehaviorInteraction => ({
  kind: "save",
  category,
  occurredAt: at(daysAgo),
});
const apply = (category: string, daysAgo = 0): BehaviorInteraction => ({
  kind: "apply",
  category,
  occurredAt: at(daysAgo),
});
const pass = (category: string, daysAgo = 0): BehaviorInteraction => ({
  kind: "pass",
  category,
  occurredAt: at(daysAgo),
});

describe("computeBehaviorProfile", () => {
  it("cold start: no interactions → empty profile, zero adjustment", () => {
    const profile = computeBehaviorProfile([], NOW);
    expect(profile.categories).toEqual({});
    expect(behavioralAdjustment(profile, "farm")).toBe(0);
    expect(behavioralAdjustment(EMPTY_BEHAVIOR_PROFILE, "farm")).toBe(0);
  });

  it("a single save does not activate affinity (accidental-tap resistance)", () => {
    const profile = computeBehaviorProfile([save("maritime")], NOW);
    expect(profile.categories.maritime?.affinity).toBe(0);
    expect(behavioralAdjustment(profile, "maritime")).toBe(0);
  });

  it("a single pass does not activate aversion", () => {
    const profile = computeBehaviorProfile([pass("farm")], NOW);
    expect(behavioralAdjustment(profile, "farm")).toBe(0);
  });

  it("a deliberate apply activates positive affinity alone", () => {
    const profile = computeBehaviorProfile([apply("maritime")], NOW);
    expect(profile.categories.maritime?.affinity).toBeGreaterThan(0);
    expect(behavioralAdjustment(profile, "maritime")).toBeGreaterThan(0);
  });

  it("repeated saves accumulate past the activation threshold", () => {
    const profile = computeBehaviorProfile(
      [save("seasonal"), save("seasonal", 1)],
      NOW,
    );
    expect(profile.categories.seasonal?.evidence).toBeGreaterThanOrEqual(
      BEHAVIOR_ACTIVATION_EVIDENCE,
    );
    expect(behavioralAdjustment(profile, "seasonal")).toBeGreaterThan(0);
  });

  it("adjustment is bounded to ±BEHAVIOR_MAX_ADJUST even under heavy signal", () => {
    const heavy = Array.from({ length: 50 }, (_, i) => apply("farm", i % 5));
    const negative = Array.from({ length: 50 }, (_, i) => ({
      kind: "withdraw" as const,
      category: "remote",
      occurredAt: at(i % 5),
    }));
    const profile = computeBehaviorProfile([...heavy, ...negative], NOW);
    expect(behavioralAdjustment(profile, "farm")).toBe(BEHAVIOR_MAX_ADJUST);
    expect(behavioralAdjustment(profile, "remote")).toBe(-BEHAVIOR_MAX_ADJUST);
  });

  it("evidence decays: old interactions weigh half per half-life", () => {
    const fresh = computeBehaviorProfile([apply("farm")], NOW);
    const aged = computeBehaviorProfile([apply("farm", BEHAVIOR_HALF_LIFE_DAYS)], NOW);
    expect(aged.categories.farm!.evidence).toBeCloseTo(
      fresh.categories.farm!.evidence / 2,
      2,
    );
  });

  it("very old signal falls back below activation and stops mattering", () => {
    const profile = computeBehaviorProfile(
      [apply("farm", BEHAVIOR_HALF_LIFE_DAYS * 4)],
      NOW,
    );
    expect(behavioralAdjustment(profile, "farm")).toBe(0);
  });

  it("opposing signals cancel instead of compounding", () => {
    const profile = computeBehaviorProfile(
      [save("farm"), save("farm"), { kind: "unsave", category: "farm", occurredAt: at(0) }, pass("farm"), pass("farm")],
      NOW,
    );
    // +1.5 +1.5 -1 -0.75 -0.75 = 0.5 → below activation.
    expect(behavioralAdjustment(profile, "farm")).toBe(0);
  });

  it("skips malformed rows instead of guessing", () => {
    const profile = computeBehaviorProfile(
      [
        { kind: "save", category: null, occurredAt: at(0) },
        { kind: "save", category: "farm", occurredAt: "not-a-date" },
        { kind: "save", category: "farm", occurredAt: at(-5) }, // future
      ],
      NOW,
    );
    expect(profile.categories.farm).toBeUndefined();
  });

  it("is deterministic and category-normalizing", () => {
    const interactions = [apply(" Farm "), apply("farm", 1)];
    const a = computeBehaviorProfile(interactions, NOW);
    const b = computeBehaviorProfile(interactions, NOW);
    expect(a).toEqual(b);
    expect(Object.keys(a.categories)).toEqual(["farm"]);
  });
});

describe("personalizedOrderingScore — reorder-only, never hides", () => {
  it("adds the bounded adjustment to the ordering key", () => {
    const profile = computeBehaviorProfile(
      Array.from({ length: 10 }, (_, i) => apply("maritime", i)),
      NOW,
    );
    const adjusted = personalizedOrderingScore(70, profile, "maritime");
    expect(adjusted).toBe(70 + BEHAVIOR_MAX_ADJUST);
  });

  it("a heavily passed category is demoted but its score never zeroes", () => {
    const profile = computeBehaviorProfile(
      Array.from({ length: 20 }, (_, i) => pass("farm", i % 3)),
      NOW,
    );
    const adjusted = personalizedOrderingScore(60, profile, "farm");
    expect(adjusted).toBeGreaterThanOrEqual(60 - BEHAVIOR_MAX_ADJUST);
    expect(adjusted).toBeGreaterThan(0); // demoted in order, never erased
  });

  it("unknown category → untouched score", () => {
    const profile = computeBehaviorProfile([apply("farm")], NOW);
    expect(personalizedOrderingScore(55, profile, "maritime")).toBe(55);
    expect(personalizedOrderingScore(55, profile, null)).toBe(55);
  });
});
