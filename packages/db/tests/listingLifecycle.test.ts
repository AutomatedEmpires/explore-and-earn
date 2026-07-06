/**
 * Unit tests for the host listing lifecycle:
 *  - canTransitionListing pins the full transition map (there is intentionally
 *    NO under_review -> live edge — that's the admin approval flow)
 *  - updateListingStatus enforces ownership, transition validity, and the
 *    PLAN_ENTITLEMENTS listing cap (feat/enforce-listing-cap) at the one
 *    transition that newly consumes a slot: draft -> under_review
 *  - status timestamps (published_at / paused_at / archived_at) are stamped
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
const mockClient = { from: mockFrom };
vi.mock("../src/client.js", () => ({
  authedClient: () => mockClient,
}));
// updateListingStatus never touches the admin client, but the module imports it.
vi.mock("../src/adminClient.js", () => ({
  adminClient: () => ({ from: vi.fn() }),
}));

import { PLAN_ENTITLEMENTS, type ListingStatus } from "@explore-and-earn/contracts";

import {
  canTransitionListing,
  updateListingStatus,
} from "../src/queries/listingLifecycle.js";

/** Fluent chain stub; `count` supports the head-count query shape. */
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

function queueFromResults(...chains: ReturnType<typeof makeChain>[]) {
  for (const chain of chains) mockFrom.mockReturnValueOnce(chain);
}

const HOST_PROFILE = makeChain({ data: { id: "host-1" } });

beforeEach(() => {
  mockFrom.mockReset();
});

// ── canTransitionListing: pin the whole map ────────────────────────────────

describe("canTransitionListing", () => {
  const ALLOWED: ReadonlyArray<[ListingStatus, ListingStatus]> = [
    ["draft", "under_review"],
    ["under_review", "draft"],
    ["live", "paused"],
    ["live", "archived"],
    ["paused", "live"],
    ["paused", "archived"],
  ];

  it.each(ALLOWED)("allows %s -> %s", (from, to) => {
    expect(canTransitionListing(from, to)).toBe(true);
  });

  it("FORBIDS under_review -> live — publishing is the admin approval flow, not a host action", () => {
    expect(canTransitionListing("under_review", "live")).toBe(false);
  });

  it("treats closed and archived as terminal", () => {
    const statuses: ListingStatus[] = [
      "draft",
      "under_review",
      "live",
      "paused",
      "closed",
      "archived",
    ];
    for (const to of statuses) {
      expect(canTransitionListing("closed", to)).toBe(false);
      expect(canTransitionListing("archived", to)).toBe(false);
    }
  });

  it("forbids draft -> live (must go through review)", () => {
    expect(canTransitionListing("draft", "live")).toBe(false);
  });
});

// ── updateListingStatus ────────────────────────────────────────────────────

describe("updateListingStatus", () => {
  it("submits a draft for review when under the plan cap", async () => {
    const read = makeChain({ data: { id: "l1", status: "draft" } });
    const tierRead = makeChain({ data: { subscription_tier: "starter" } });
    const capCount = makeChain({ count: PLAN_ENTITLEMENTS.starter.listings - 1 });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, tierRead, capCount, update);

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result).toEqual({ ok: true, status: "under_review" });
    expect(update.update).toHaveBeenCalledWith({ status: "under_review" });
  });

  it("returns listing_cap_reached when active listings are at the tier cap", async () => {
    const read = makeChain({ data: { id: "l1", status: "draft" } });
    const tierRead = makeChain({ data: { subscription_tier: "starter" } });
    const capCount = makeChain({ count: PLAN_ENTITLEMENTS.starter.listings });
    queueFromResults(HOST_PROFILE, read, tierRead, capCount);

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  it("floors a host with no subscription (tier null -> 'none') at the starter cap", async () => {
    const read = makeChain({ data: { id: "l1", status: "draft" } });
    const tierRead = makeChain({ data: { subscription_tier: null } });
    const capCount = makeChain({ count: PLAN_ENTITLEMENTS.starter.listings });
    queueFromResults(HOST_PROFILE, read, tierRead, capCount);

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  it("skips the cap check for live -> paused (already counted as active)", async () => {
    const read = makeChain({ data: { id: "l1", status: "live" } });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);

    const result = await updateListingStatus("token", "user_1", "l1", "paused");

    expect(result).toEqual({ ok: true, status: "paused" });
    // profile read + listing read + update — NO tier read, NO count query.
    expect(mockFrom).toHaveBeenCalledTimes(3);
    const patch = (update.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(patch.status).toBe("paused");
    expect(typeof patch.paused_at).toBe("string");
  });

  it("stamps archived_at when archiving", async () => {
    const read = makeChain({ data: { id: "l1", status: "paused" } });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);

    const result = await updateListingStatus("token", "user_1", "l1", "archived");

    expect(result.ok).toBe(true);
    const patch = (update.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof patch.archived_at).toBe("string");
  });

  it("returns invalid_transition for a forbidden edge (under_review -> live)", async () => {
    const read = makeChain({ data: { id: "l1", status: "under_review" } });
    queueFromResults(HOST_PROFILE, read);

    const result = await updateListingStatus("token", "user_1", "l1", "live");

    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  it("is a no-op success when the listing is already in the target status", async () => {
    const read = makeChain({ data: { id: "l1", status: "paused" } });
    queueFromResults(HOST_PROFILE, read);

    const result = await updateListingStatus("token", "user_1", "l1", "paused");

    expect(result).toEqual({ ok: true, status: "paused" });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("denies a listing the host doesn't own (scoped read returns nothing)", async () => {
    queueFromResults(HOST_PROFILE, makeChain({ data: null }));

    const result = await updateListingStatus("token", "user_1", "l1", "paused");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found|access/i);
  });

  it("fails cleanly when the user has no host profile", async () => {
    queueFromResults(makeChain({ data: null }));

    const result = await updateListingStatus("token", "user_1", "l1", "paused");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/host profile/i);
  });
});
