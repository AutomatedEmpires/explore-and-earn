import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PLAN_ENTITLEMENTS, TEAM_SEATS_BY_TIER } from "@explore-and-earn/contracts";

import { HOME_PLANS } from "../../components/home/home-data";

/**
 * A plan card may not advertise an entitlement the plan does not grant.
 *
 * This is the "empty promise" class that zeroed teamSeats in the first place:
 * the Enterprise card used to sell "Multi-location + team seats" while
 * team_memberships had a table, RLS, and no application code. Building invite /
 * accept / revoke did not settle it — accepting still grants no access to any
 * listing, applicant or analytic — so the entitlement is back at zero and no
 * surface may claim one.
 *
 * Both directions are asserted, because either one alone is the defect:
 *   • a card that sells a seat when the entitlement is 0 is a lie;
 *   • a card that hides a seat the plan grants means a host paid for something
 *     nobody told them about.
 *
 * The Stripe product description is checked too: it is customer-facing copy that
 * lives outside the app, and it is where the "1 team seat" figure was quoted
 * back at the contract as evidence for restoring the entitlement.
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

  it("the Stripe product description sells no seat the plan does not grant", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          "../../../../packages/stripe-seed/expected-stripe-manifest.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { products: { key: string; description: string }[] };

    for (const key of ["starter", "professional", "enterprise"] as const) {
      const product = manifest.products.find((p) => p.key === key);
      expect(product, `no Stripe product for ${key}`).toBeDefined();
      const claimsSeat = SEAT_CLAIM.test(product!.description);
      expect(
        claimsSeat,
        `${key}'s Stripe description ${claimsSeat ? "sells" : "omits"} a team ` +
          `seat while PLAN_ENTITLEMENTS grants ${PLAN_ENTITLEMENTS[key].teamSeats}`,
      ).toBe(PLAN_ENTITLEMENTS[key].teamSeats > 0);
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
