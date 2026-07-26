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

  it("RAISES the cap by every purchased slot — the whole point of the add-on", () => {
    expect(effectiveListingCap("starter", 3)).toBe(
      PLAN_ENTITLEMENTS.starter.listings + 3,
    );
  });

  it("floors a host with no subscription at the Starter entitlement, not at zero", () => {
    expect(includedListingCapFor("none")).toBe(PLAN_ENTITLEMENTS.starter.listings);
    expect(includedListingCapFor(null)).toBe(PLAN_ENTITLEMENTS.starter.listings);
  });

  it.each([null, undefined, -4, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "ignores a corrupted purchased figure (%s) rather than widening or shrinking the cap",
    (slots) => {
      expect(effectiveListingCap("starter", slots as number | null | undefined)).toBe(
        PLAN_ENTITLEMENTS.starter.listings,
      );
    },
  );

  it("counts live and paused listings against the cap, and nothing else", () => {
    expect([...CAP_COUNTED_LISTING_STATUSES]).toEqual(["live", "paused"]);
  });
});

describe("hasListingSlotAvailable", () => {
  it("REFUSES when the host is at the included cap and has bought nothing", () => {
    expect(
      hasListingSlotAvailable({
        tier: "starter",
        purchasedSlots: 0,
        activeListingCount: PLAN_ENTITLEMENTS.starter.listings,
      }),
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

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("updateListingStatus honours the purchased allowance", () => {
  it("REFUSES publication at the included cap when nothing was purchased", async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }))
      .mockReturnValueOnce(makeChain({ data: { subscription_tier: "starter" } }))
      .mockReturnValueOnce(makeChain({ count: PLAN_ENTITLEMENTS.starter.listings }));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  it("PERMITS publication past the included cap once a slot has been bought", async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null });
    const update = makeChain({ data: { id: "l1" } });
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }))
      .mockReturnValueOnce(makeChain({ data: { subscription_tier: "starter" } }))
      .mockReturnValueOnce(makeChain({ count: PLAN_ENTITLEMENTS.starter.listings }))
      .mockReturnValueOnce(update);

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: true, status: "under_review" });
    expect(update.update).toHaveBeenCalledWith({ status: "under_review" });
  });

  it("REFUSES again once the purchased slots are themselves used up", async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null });
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }))
      .mockReturnValueOnce(makeChain({ data: { subscription_tier: "starter" } }))
      .mockReturnValueOnce(makeChain({ count: PLAN_ENTITLEMENTS.starter.listings + 1 }));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  it("treats an unreadable allowance as zero — a fault must not widen the cap", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "conn reset" } });
    mockFrom
      .mockReturnValueOnce(HOST_PROFILE)
      .mockReturnValueOnce(makeChain({ data: { ...ANSWERED_DRAFT } }))
      .mockReturnValueOnce(makeChain({ data: { subscription_tier: "starter" } }))
      .mockReturnValueOnce(makeChain({ count: PLAN_ENTITLEMENTS.starter.listings }));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");
    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });
});
