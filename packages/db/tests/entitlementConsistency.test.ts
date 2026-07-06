/**
 * Founder-locked entitlement consistency (ADR-039): the same monthly
 * announcement allowance is encoded twice in contracts —
 * ANNOUNCEMENT_MONTHLY_QUOTA (community.ts, used by the quota gate in
 * app/actions/community.ts) and PLAN_ENTITLEMENTS[tier].monthlyAnnouncements
 * (pricing.ts, shown on pricing surfaces). If they drift, the product SELLS
 * one allowance and ENFORCES another. This test makes drift impossible to
 * ship silently.
 */

import { describe, it, expect } from "vitest";

import {
  ANNOUNCEMENT_MONTHLY_QUOTA,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";

describe("announcement allowance consistency (ADR-039)", () => {
  it.each(["starter", "professional", "enterprise"] as const)(
    "quota gate and pricing entitlements agree for %s",
    (tier) => {
      expect(ANNOUNCEMENT_MONTHLY_QUOTA[tier]).toBe(
        PLAN_ENTITLEMENTS[tier].monthlyAnnouncements,
      );
    },
  );

  it("unsubscribed hosts ('none') get zero included announcements", () => {
    expect(ANNOUNCEMENT_MONTHLY_QUOTA.none).toBe(0);
  });

  it("every quota tier is a non-negative integer", () => {
    for (const [tier, quota] of Object.entries(ANNOUNCEMENT_MONTHLY_QUOTA)) {
      expect(Number.isInteger(quota), `${tier} quota must be an integer`).toBe(true);
      expect(quota, `${tier} quota must be >= 0`).toBeGreaterThanOrEqual(0);
    }
  });
});
