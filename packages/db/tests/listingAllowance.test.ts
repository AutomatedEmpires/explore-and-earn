/**
 * Additional-listing add-on (founder decision 2026-07-26: "additional listings
 * need to be an add on. price based on tier.").
 *
 * The defect this pins: the host settings page quoted three prices for extra
 * listings with no checkout, no Stripe price, and no per-host allowance — so a
 * host who paid could not have been given anything. The purchased allowance
 * must actually RAISE the cap the publication gate enforces, or the add-on is a
 * charge for nothing.
 *
 * RECONCILED 2026-07-26. Two workstreams shipped two allowance implementations
 * that disagreed, and this file used to assert the losing half of both
 * disagreements. What changed and why:
 *
 *   * tier 'none' was asserted to floor at the Starter allowance. There is no
 *     free tier; 083's private.plan_listing_allowance() returns 0 for 'none',
 *     and a test that pins the application to 1 where the database enforces 0
 *     documents a disagreement instead of a contract.
 *   * counted statuses were asserted to be exactly live + paused. under_review
 *     counts too — that is what stops a host staging listings through review
 *     under a cap of 1 and publishing all of them.
 *   * updateListingStatus was asserted to compose the cap from a tier read plus
 *     a separate purchased-slots read. It now asks the database for one number
 *     (my_listing_allowance_state), which is what closes the gap where Stripe
 *     said "you have capacity" and the database said "no".
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockClient = { from: mockFrom, rpc: mockRpc };
vi.mock("../src/client.js", () => ({
  authedClient: () => mockClient,
  anonClient: () => mockClient,
}));
vi.mock("../src/adminClient.js", () => ({
  adminClient: () => ({ from: vi.fn(), rpc: mockRpc }),
}));

import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import {
  CAP_COUNTED_LISTING_STATUSES,
  effectiveListingCap,
  hasListingSlotAvailable,
  includedListingCapFor,
} from "../src/lib/listingAllowance.js";
import { updateListingStatus } from "../src/queries/listingLifecycle.js";

// ── Pure allowance arithmetic ──────────────────────────────────────────────

describe("effectiveListingCap", () => {
  it("is the plan's included count when nothing has been purchased", () => {
    expect(effectiveListingCap("starter", 0)).toBe(PLAN_ENTITLEMENTS.starter.listings);
    expect(effectiveListingCap("professional", 0)).toBe(
      PLAN_ENTITLEMENTS.professional.listings,
    );
    expect(effectiveListingCap("enterprise", 0)).toBe(
      PLAN_ENTITLEMENTS.enterprise.listings,
    );
  });

  /**
   * The add-on's entire promise, stated as arithmetic: allowance = plan + N.
   * Migration 083's private.host_listing_allowance() computes the same sum from
   * host_profiles.purchased_listing_slots; entitlementAllowanceSql.test.ts holds
   * that half.
   */
  it.each([
    ["starter", 5],
    ["professional", 2],
    ["enterprise", 11],
  ] as const)("gives a %s host with N purchased slots exactly plan + N", (tier, slots) => {
    expect(effectiveListingCap(tier, slots)).toBe(
      PLAN_ENTITLEMENTS[tier].listings + slots,
    );
  });

  /**
   * No free tier (founder, 2026-07-26). An unsubscribed host gets ZERO included
   * listings — flooring them at Starter handed every non-paying host a free live
   * listing while the FAQ said a plan was required, and — paired with an add-on
   * quoted at the Starter rate for tier 'none' — let them buy every further
   * listing without ever buying the plan those listings belong to.
   */
  it.each(["none", null, undefined, "", "gold", "STARTER"])(
    "gives an unsubscribed or unreadable tier (%s) ZERO included listings — there is no free tier",
    (tier) => {
      expect(includedListingCapFor(tier as string | null | undefined)).toBe(0);
    },
  );

  it("still gives each PAID tier exactly its entitlement", () => {
    expect(includedListingCapFor("starter")).toBe(PLAN_ENTITLEMENTS.starter.listings);
    expect(includedListingCapFor("professional")).toBe(
      PLAN_ENTITLEMENTS.professional.listings,
    );
    expect(includedListingCapFor("enterprise")).toBe(
      PLAN_ENTITLEMENTS.enterprise.listings,
    );
  });

  /**
   * A slot bought while unsubscribed is still a slot bought. This is the one
   * case where 'none' is not a flat refusal, and it matches the database:
   * private.host_listing_allowance() adds the purchased term to a plan term of 0.
   */
  it("still counts purchased slots for an unsubscribed host", () => {
    expect(effectiveListingCap("none", 2)).toBe(2);
  });

  it.each([null, undefined, -4, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "ignores a corrupted purchased figure (%s) rather than widening or shrinking the cap",
    (slots) => {
      expect(effectiveListingCap("starter", slots as number | null | undefined)).toBe(
        PLAN_ENTITLEMENTS.starter.listings,
      );
    },
  );

  /**
   * under_review is in the set, and that is load-bearing. 082 made
   * under_review -> live a HOST edge with no operator in between, so if entering
   * review cost nothing a host on a cap of 1 could stage N drafts through review
   * — the count reads 0 at every step — and then publish all N.
   */
  it("counts under_review as well as live and paused", () => {
    expect([...CAP_COUNTED_LISTING_STATUSES].sort()).toEqual(
      ["live", "paused", "under_review"].sort(),
    );
  });
});

describe("hasListingSlotAvailable", () => {
  it("REFUSES an unsubscribed host their very first active listing", () => {
    expect(
      hasListingSlotAvailable({
        tier: "none",
        purchasedSlots: 0,
        activeListingCount: 0,
      }),
    ).toBe(false);
  });

  it("REFUSES when the host is at the included cap and has bought nothing", () => {
    expect(
      hasListingSlotAvailable({
        tier: "starter",
        purchasedSlots: 0,
        activeListingCount: PLAN_ENTITLEMENTS.starter.listings,
      }),
    ).toBe(false);
  });

  it("REFUSES an unsubscribed host their first listing", () => {
    expect(
      hasListingSlotAvailable({ tier: "none", purchasedSlots: 0, activeListingCount: 0 }),
    ).toBe(false);
  });

  it("permits exactly the slots that were paid for, and no more", () => {
    const base = PLAN_ENTITLEMENTS.starter.listings;
    expect(
      hasListingSlotAvailable({
        tier: "starter",
        purchasedSlots: 1,
        activeListingCount: base,
      }),
    ).toBe(true);
    expect(
      hasListingSlotAvailable({
        tier: "starter",
        purchasedSlots: 1,
        activeListingCount: base + 1,
      }),
    ).toBe(false);
  });
});

// ── The enforcement point ──────────────────────────────────────────────────

function makeChain(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const terminal = () =>
    Promise.resolve({ data: null, error: null, count: null, ...result });
  chain.select = self;
  chain.update = vi.fn(self);
  chain.eq = self;
  chain.in = self;
  chain.maybeSingle = terminal;
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return chain;
}

const HOST_PROFILE = makeChain({ data: { id: "host-1" } });

const ANSWERED_DRAFT = {
  id: "l1",
  status: "draft",
  provenance: "verified",
  housing_evidence: "confirmed",
  housing_included: false,
  meals_evidence: "confirmed",
  pay_evidence: "confirmed",
  compensation_min_cents: 22_000,
  compensation_max_cents: null,
} as const;

/** The jsonb my_listing_allowance_state returns. */
function allowanceState(tier: string, allowance: number, used: number) {
  return { data: { tier, allowance, used }, error: null };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("updateListingStatus honours the purchased allowance", () => {
  it("REFUSES publication at the included cap when nothing was purchased", async () => {
    mockRpc.mockResolvedValue(
      allowanceState("starter", PLAN_ENTITLEMENTS.starter.listings, PLAN_ENTITLEMENTS.starter.listings),
    );
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  it("PERMITS publication past the included cap once a slot has been bought", async () => {
    const base = PLAN_ENTITLEMENTS.starter.listings;
    mockRpc.mockResolvedValue(allowanceState("starter", base + 1, base));
    const update = makeChain({ data: { id: "l1" } });
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }))
      .mockReturnValueOnce(update);

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: true, status: "under_review" });
    expect(update.update).toHaveBeenCalledWith({ status: "under_review" });
  });

  it("REFUSES again once the purchased slots are themselves used up", async () => {
    const base = PLAN_ENTITLEMENTS.starter.listings;
    mockRpc.mockResolvedValue(allowanceState("starter", base + 1, base + 1));
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  /**
   * The number quoted to the host is the number the database enforces, because
   * it is literally the same number: one RPC read, no local recomposition. If
   * this ever needed a second read to reach the right answer, the application
   * and the trigger would be free to drift again.
   */
  it("asks the database for the allowance instead of composing its own", async () => {
    const base = PLAN_ENTITLEMENTS.starter.listings;
    mockRpc.mockResolvedValue(allowanceState("starter", base + 4, 0));
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }))
      .mockReturnValueOnce(makeChain({ data: { id: "l1" } }));

    await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(mockRpc).toHaveBeenCalledWith("my_listing_allowance_state", {
      p_host_profile_id: "host-1",
    });
    // No subscription_tier read and no my_purchased_listing_slots read: three
    // from() calls only — host profile, listing, and the status UPDATE.
    expect(mockFrom).toHaveBeenCalledTimes(3);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  /**
   * No free tier, at the enforcement point rather than in the arithmetic: a host
   * with no subscription and NOT ONE listing is still refused their first. The
   * allowance the RPC reports for tier 'none' is 0, and 0 used is not below 0.
   */
  it("REFUSES an unsubscribed host with no listings at all — no free tier", async () => {
    mockRpc.mockResolvedValue(allowanceState("none", 0, 0));
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  it("treats an unreadable allowance as zero — a fault must not widen the cap", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "conn reset" } });
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: false, error: "conn reset" });
  });

  /**
   * A malformed jsonb payload must refuse, not pass. parseListingAllowanceState
   * degrades an unreadable `used` to MAX_SAFE_INTEGER precisely so this cannot
   * read as spare capacity.
   */
  it("REFUSES on a malformed allowance payload", async () => {
    mockRpc.mockResolvedValue({ data: { tier: "starter" }, error: null });
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });
});
