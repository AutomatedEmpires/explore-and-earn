/**
 * The host review system must be REACHABLE (readiness audit 2026-07-24).
 *
 * The defect this pins: hostReviews gates on
 * REVIEWABLE_STATUSES = ['active', 'completed'], but HOST_SETTABLE_STATUSES
 * stopped at 'accepted' and nothing else in the product wrote either value —
 * no cron, no RPC, no trigger, no admin path. Every application therefore ended
 * its life at 'accepted', the review gate never opened, and the entire
 * two-sided trust layer was dead code behind a five-item allow-list.
 *
 * Everything BELOW the application layer was already correct: migration 001
 * seeds accepted->active and active->completed, contracts mirrors them, RLS
 * applications_update_host scopes by listing ownership with no status clause,
 * and 066 grants update(status). So this asserts the property that actually
 * broke — that a path exists from an accepted application to a reviewable one —
 * rather than re-testing the state machine.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { APPLICATION_TRANSITIONS, canTransition } from "@explore-and-earn/contracts";
import { HOST_SETTABLE_STATUSES } from "../src/queries/applications.js";

/** Mirror of hostReviews.ts REVIEWABLE_STATUSES. */
const REVIEWABLE_STATUSES = ["active", "completed"] as const;

const settable = new Set<string>(HOST_SETTABLE_STATUSES);

describe("an engagement can reach a reviewable state", () => {
  it("exposes both engagement states to the host", () => {
    expect(settable.has("active")).toBe(true);
    expect(settable.has("completed")).toBe(true);
  });

  it("every reviewable status is actually settable by someone", () => {
    for (const status of REVIEWABLE_STATUSES) {
      expect(settable.has(status)).toBe(true);
    }
  });

  /**
   * The end-to-end property: walk the real transition map from 'accepted' using
   * only statuses a host may set, and confirm a reviewable state is reachable.
   * This is what was false before — and it fails again if either the allow-list
   * or the transition map regresses.
   */
  it("a reviewable state is reachable from 'accepted' using only host-settable edges", () => {
    const seen = new Set<string>(["accepted"]);
    const queue: string[] = ["accepted"];
    let reachedReviewable = false;

    while (queue.length > 0) {
      const current = queue.shift() as keyof typeof APPLICATION_TRANSITIONS;
      const next: readonly string[] = APPLICATION_TRANSITIONS[current] ?? [];
      for (const target of next) {
        if (!settable.has(target) || seen.has(target)) continue;
        // Only follow edges the state machine itself considers legal.
        expect(canTransition(APPLICATION_TRANSITIONS, current, target as never)).toBe(true);
        seen.add(target);
        queue.push(target);
        if ((REVIEWABLE_STATUSES as readonly string[]).includes(target)) {
          reachedReviewable = true;
        }
      }
    }

    expect(reachedReviewable).toBe(true);
    expect(seen.has("active")).toBe(true);
    expect(seen.has("completed")).toBe(true);
  });

  /**
   * Negative control: widening the allow-list must not have smuggled in an
   * illegal edge. A host may only set 'active' from 'accepted', and 'completed'
   * from 'active' — never straight from 'accepted'.
   */
  it("does NOT allow skipping the engagement — accepted cannot jump to completed", () => {
    expect(canTransition(APPLICATION_TRANSITIONS, "accepted", "completed")).toBe(false);
    expect(canTransition(APPLICATION_TRANSITIONS, "accepted", "active")).toBe(true);
    expect(canTransition(APPLICATION_TRANSITIONS, "active", "completed")).toBe(true);
    // And terminal really is terminal.
    expect(APPLICATION_TRANSITIONS).not.toHaveProperty("completed");
  });

  it("does NOT let a host set seeker-owned or system-owned statuses", () => {
    // withdrawn is the seeker's; expired belongs to the lifecycle sweep.
    expect(settable.has("withdrawn")).toBe(false);
    expect(settable.has("expired")).toBe(false);
  });
});
