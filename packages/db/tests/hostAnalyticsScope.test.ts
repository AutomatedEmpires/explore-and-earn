/**
 * Host analytics — the basic/full split (ADR-039; founder decision 2026-07-26
 * that analytics depth is INCLUDED per tier, not an add-on).
 *
 * The defect this pins: PLAN_ENTITLEMENTS declared analytics "basic" | "full"
 * and four surfaces sold the distinction, but the only gate in the product was
 * `subscriptionTier === "none"` on the analytics page. A Starter host — sold
 * "basic analytics" — received the complete per-listing dataset, and it was
 * rendered under a CSS blur, i.e. present in the DOM.
 *
 * The tests assert the REFUSAL: a basic-tier caller does not receive
 * per-listing rows from getHostAnalytics at all.
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
vi.mock("../src/client", () => ({
  authedClient: () => ({ from: mockFrom }),
  anonClient: () => ({ from: mockFrom }),
}));

import { ANALYTICS_ENTITLEMENT, PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import {
  analyticsScopeForTier,
  applyAnalyticsScope,
  emptyHostAnalytics,
} from "../src/lib/hostAnalyticsScope.js";
import { getHostAnalytics } from "../src/hostAnalytics.js";

// ── Contract consistency ───────────────────────────────────────────────────

describe("analytics entitlement consistency", () => {
  it.each(["starter", "professional", "enterprise"] as const)(
    "the sold entitlement and the resolved scope agree for %s",
    (tier) => {
      expect(ANALYTICS_ENTITLEMENT[tier]).toBe(PLAN_ENTITLEMENTS[tier].analytics);
      expect(analyticsScopeForTier(tier)).toBe(PLAN_ENTITLEMENTS[tier].analytics);
    },
  );

  it("gives Starter the BASIC scope — the plan it is sold under", () => {
    expect(analyticsScopeForTier("starter")).toBe("basic");
  });

  it.each([null, undefined, "", "none", "gold", "ENTERPRISE"])(
    "resolves an unreadable tier (%s) to basic, never to full",
    (tier) => {
      expect(analyticsScopeForTier(tier as string | null | undefined)).toBe("basic");
    },
  );
});

// ── The redaction ──────────────────────────────────────────────────────────

const FULL_INPUT = {
  totalApplicationsByStatus: { applied: 4, accepted: 1 },
  activeListingCount: 2,
  listingCount: 3,
  inviteAcceptanceRate: 0.5,
  perListingStats: [
    {
      listingId: "l1",
      listingTitle: "Deckhand",
      listingStatus: "live",
      applicationsByStatus: { applied: 4 },
      totalApplications: 4,
      invitesSent: 2,
      invitesAccepted: 1,
    },
  ],
};

describe("applyAnalyticsScope", () => {
  it("REFUSES per-listing rows on the basic scope", () => {
    const scoped = applyAnalyticsScope(FULL_INPUT, "basic");
    expect(scoped.perListingStats).toEqual([]);
    expect(scoped.analyticsScope).toBe("basic");
  });

  it("keeps the account-wide aggregates a basic plan DOES include", () => {
    const scoped = applyAnalyticsScope(FULL_INPUT, "basic");
    expect(scoped.totalApplicationsByStatus).toEqual({ applied: 4, accepted: 1 });
    expect(scoped.activeListingCount).toBe(2);
    expect(scoped.inviteAcceptanceRate).toBe(0.5);
  });

  it("keeps listingCount on the basic scope — blanking it would tell a paying host they have no listings", () => {
    expect(applyAnalyticsScope(FULL_INPUT, "basic").listingCount).toBe(3);
  });

  it("passes everything through on the full scope", () => {
    const scoped = applyAnalyticsScope(FULL_INPUT, "full");
    expect(scoped.perListingStats).toHaveLength(1);
    expect(scoped.analyticsScope).toBe("full");
  });

  it("defaults an empty result to the LEAST entitlement", () => {
    expect(emptyHostAnalytics().analyticsScope).toBe("basic");
  });
});

// ── getHostAnalytics: the gate lives at the data source ────────────────────

/** Fluent chain stub covering the shapes hostAnalytics.ts uses. */
function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const terminal = () => Promise.resolve({ data: null, error: null, ...result });
  chain.select = self;
  chain.eq = self;
  chain.in = self;
  chain.gte = self;
  chain.order = self;
  chain.limit = self;
  chain.maybeSingle = terminal;
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return chain;
}

/**
 * getHostAnalytics reads, in order: host_profiles (ids), host_profiles (tier),
 * listings, then applications + invites in parallel.
 */
function queueAnalyticsReads(tier: string | null) {
  mockFrom
    .mockReturnValueOnce(makeChain({ data: [{ id: "host-1" }] }))
    .mockReturnValueOnce(makeChain({ data: { subscription_tier: tier } }))
    .mockReturnValueOnce(
      makeChain({
        data: [
          { id: "l1", title: "Deckhand", status: "live" },
          { id: "l2", title: "Farmhand", status: "draft" },
        ],
      }),
    )
    .mockReturnValueOnce(
      makeChain({
        data: [
          { id: "a1", listing_id: "l1", status: "applied" },
          { id: "a2", listing_id: "l1", status: "accepted" },
        ],
      }),
    )
    .mockReturnValueOnce(
      makeChain({ data: [{ id: "i1", listing_id: "l1", status: "accepted" }] }),
    );
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe("getHostAnalytics (server-side gate)", () => {
  it("REFUSES per-listing data to a Starter host", async () => {
    queueAnalyticsReads("starter");
    const result = await getHostAnalytics("token", "user_1");

    expect(result.analyticsScope).toBe("basic");
    expect(result.perListingStats).toEqual([]);
    // Nothing about an individual listing survives the gate.
    expect(JSON.stringify(result)).not.toContain("Deckhand");
  });

  it("REFUSES per-listing data to a host with no subscription", async () => {
    queueAnalyticsReads(null);
    const result = await getHostAnalytics("token", "user_1");
    expect(result.perListingStats).toEqual([]);
  });

  it("still reports the account-wide truth to a Starter host", async () => {
    queueAnalyticsReads("starter");
    const result = await getHostAnalytics("token", "user_1");

    expect(result.listingCount).toBe(2);
    expect(result.activeListingCount).toBe(1);
    expect(result.totalApplicationsByStatus).toEqual({ applied: 1, accepted: 1 });
    expect(result.inviteAcceptanceRate).toBe(1);
  });

  it("delivers the per-listing breakdown to a Professional host", async () => {
    queueAnalyticsReads("professional");
    const result = await getHostAnalytics("token", "user_1");

    expect(result.analyticsScope).toBe("full");
    expect(result.perListingStats).toHaveLength(2);
    expect(result.perListingStats[0]).toMatchObject({
      listingId: "l1",
      totalApplications: 2,
      invitesSent: 1,
      invitesAccepted: 1,
    });
  });

  it("delivers the per-listing breakdown to an Enterprise host", async () => {
    queueAnalyticsReads("enterprise");
    const result = await getHostAnalytics("token", "user_1");
    expect(result.perListingStats).toHaveLength(2);
  });

  it("falls back to basic when the tier read faults — an error must not buy the paid view", async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: [{ id: "host-1" }] }))
      .mockReturnValueOnce(makeChain({ error: { message: "conn reset" } }))
      .mockReturnValueOnce(
        makeChain({ data: [{ id: "l1", title: "Deckhand", status: "live" }] }),
      )
      .mockReturnValueOnce(makeChain({ data: [] }))
      .mockReturnValueOnce(makeChain({ data: [] }));

    const result = await getHostAnalytics("token", "user_1");
    expect(result.analyticsScope).toBe("basic");
    expect(result.perListingStats).toEqual([]);
  });
});
