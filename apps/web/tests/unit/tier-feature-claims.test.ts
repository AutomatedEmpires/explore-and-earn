import { describe, expect, it } from "vitest";

import { PLAN_ENTITLEMENTS, TEAM_SEATS_BY_TIER } from "@explore-and-earn/contracts";

import { HOME_PLANS } from "../../components/home/home-data";

/**
 * A plan card may not advertise an entitlement the plan does not grant.
 *
 * This is the "empty promise" class that zeroed teamSeats in the first place:
 * the Enterprise card used to sell "Multi-location + team seats" while
 * team_memberships had a table, RLS, and no application code. The fix was to
 * delete the claim; the fix now that seats are real (founder decision
 * 2026-07-26) is to state exactly the number the server will enforce.
 *
 * Both directions are asserted, because either one alone is the defect:
 *   • a card that sells a seat when the entitlement is 0 is a lie;
 *   • a card that hides a seat the plan grants means a host paid for something
 *     nobody told them about.
 */

const SEAT_CLAIM = /team seat/i;

function seatClaims(features: readonly string[]): string[] {
  return features.filter((f) => SEAT_CLAIM.test(f));
}

describe("home plan cards state the real team-seat entitlement", () => {
  it.each(["starter", "professional", "enterprise"] as const)(
    "%s advertises a seat if and only if its plan grants one",
    (key) => {
      const plan = HOME_PLANS.find((p) => p.key === key);
      expect(plan, `no home plan card for ${key}`).toBeDefined();
      const claims = seatClaims(plan!.features);
      if (PLAN_ENTITLEMENTS[key].teamSeats > 0) {
        expect(claims).toHaveLength(1);
        expect(claims[0]).toContain(String(PLAN_ENTITLEMENTS[key].teamSeats));
      } else {
        expect(claims).toEqual([]);
      }
    },
  );

  it("never advertises a number the server would not enforce", () => {
    for (const plan of HOME_PLANS) {
      const key = plan.key as keyof typeof TEAM_SEATS_BY_TIER;
      for (const claim of seatClaims(plan.features)) {
        // The claim must carry the enforced figure, not a marketing one.
        expect(claim).toContain(String(TEAM_SEATS_BY_TIER[key]));
      }
    }
  });

  it("makes clear a seat is IN ADDITION to the account owner", () => {
    // The owner holds no team_memberships row and is never counted against the
    // limit (lib/teamSeats.ts), so "1 team seat" on its own would read as
    // "one person total".
    for (const plan of HOME_PLANS) {
      for (const claim of seatClaims(plan.features)) {
        expect(claim.toLowerCase()).toContain("owner");
      }
    }
  });

  it("still advertises full analytics only where the plan includes it", () => {
    for (const plan of HOME_PLANS) {
      const key = plan.key as keyof typeof PLAN_ENTITLEMENTS;
      const claimsFull = plan.features.some((f) => /full analytics/i.test(f));
      expect(claimsFull).toBe(PLAN_ENTITLEMENTS[key].analytics === "full");
    }
  });
});
