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
const mockRpc = vi.fn();
const mockClient = { from: mockFrom, rpc: mockRpc };
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
  mockRpc.mockReset();
});

/** Stub public.my_listing_allowance_state(uuid) — migration 083. */
function allowanceState(tier: string, allowance: number, used: number) {
  return { data: { tier, allowance, used }, error: null };
}

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

/**
 * A draft whose host HAS answered the triad.
 *
 * Publishing now requires an explicit Housing/Meals/Pay decision (founder,
 * 2026-07-17), so every fixture that expects to reach under_review must state
 * one. A bare `{ id, status }` row is an unanswered listing, and the gate is
 * supposed to stop it — see the "blocks publication" tests below.
 */
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

describe("updateListingStatus", () => {
  it("submits a draft for review when under the plan allowance", async () => {
    const read = makeChain({ data: { ...ANSWERED_DRAFT } });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);
    mockRpc.mockResolvedValueOnce(
      allowanceState("starter", PLAN_ENTITLEMENTS.starter.listings, 0),
    );

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result).toEqual({ ok: true, status: "under_review" });
    expect(update.update).toHaveBeenCalledWith({ status: "under_review" });
    // The allowance is read from the database helper the trigger itself uses —
    // never recomputed here from a tier column.
    expect(mockRpc).toHaveBeenCalledWith("my_listing_allowance_state", {
      p_host_profile_id: "host-1",
    });
  });

  it("returns listing_cap_reached when active listings are at the allowance", async () => {
    const read = makeChain({ data: { ...ANSWERED_DRAFT } });
    queueFromResults(HOST_PROFILE, read);
    mockRpc.mockResolvedValueOnce(
      allowanceState(
        "starter",
        PLAN_ENTITLEMENTS.starter.listings,
        PLAN_ENTITLEMENTS.starter.listings,
      ),
    );

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  it("REFUSES a host with no subscription — 'none' is zero, not a free starter plan", async () => {
    // The old behaviour floored 'none' at the starter allowance, so an
    // unsubscribed host got a live listing for free while the FAQ said a plan was
    // required. Founder, 2026-07-26: there is no free tier.
    const read = makeChain({ data: { ...ANSWERED_DRAFT } });
    queueFromResults(HOST_PROFILE, read);
    mockRpc.mockResolvedValueOnce(allowanceState("none", 0, 0));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  it("counts a queued under_review listing against the allowance", async () => {
    // The slot is committed the moment a draft enters review. Counting only
    // live + paused let a host queue an unlimited number and have them all
    // approved; the RPC now reports under_review in `used`.
    const read = makeChain({ data: { ...ANSWERED_DRAFT } });
    queueFromResults(HOST_PROFILE, read);
    mockRpc.mockResolvedValueOnce(allowanceState("starter", 1, 1));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result).toEqual({ ok: false, error: "listing_cap_reached" });
  });

  it("does NOT re-check the allowance when moving between two counted statuses", async () => {
    // paused -> live consumes no new slot, so a host sitting exactly at their
    // allowance must still be able to resume a listing they already paid for.
    const read = makeChain({ data: { id: "l1", status: "paused", housing_evidence: "confirmed", provenance: "verified", housing_included: false, meals_evidence: "confirmed", pay_evidence: "confirmed", compensation_min_cents: 22_000 } });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);

    const result = await updateListingStatus("token", "user_1", "l1", "live");

    expect(result).toEqual({ ok: true, status: "live" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // ── The publication gate (founder, 2026-07-17) ───────────────────────────
  // A host-controlled listing may not face seekers with an unanswered benefit.
  // These pin the gate at the SERVER, where a host who bypasses the form still
  // meets it. (The DB constraint in 070 is the backstop for PostgREST.)

  it("BLOCKS submitting a draft whose Housing was never answered", async () => {
    const read = makeChain({
      data: { ...ANSWERED_DRAFT, housing_evidence: "not_stated" },
    });
    queueFromResults(HOST_PROFILE, read);

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("incomplete_listing");
    expect(result.blockers?.map((b) => b.field)).toEqual(["housing"]);
  });

  it("BLOCKS confirmed Housing evidence without an explicit yes/no value", async () => {
    const read = makeChain({ data: { ...ANSWERED_DRAFT, housing_included: null } });
    queueFromResults(HOST_PROFILE, read);

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("incomplete_listing");
    expect(result.blockers?.map((b) => b.field)).toEqual(["housing"]);
  });

  it("BLOCKS an unanswered Meals, and names every blocker at once", async () => {
    const read = makeChain({
      data: { ...ANSWERED_DRAFT, meals_evidence: "not_stated", pay_evidence: "not_stated" },
    });
    queueFromResults(HOST_PROFILE, read);

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result.blockers?.map((b) => b.field)).toEqual(["meals", "pay"]);
  });

  it("BLOCKS before spending a plan slot — the cap check never runs", async () => {
    // Ordering matters: an incomplete listing must not consume the host's cap
    // read, and must fail for the honest reason rather than 'listing_cap_reached'.
    const read = makeChain({ data: { ...ANSWERED_DRAFT, housing_evidence: "not_stated" } });
    queueFromResults(HOST_PROFILE, read);

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result.error).toBe("incomplete_listing");
  });

  it("does NOT block pulling a listing DOWN — drafts may stay incomplete", async () => {
    // The rule is about facing seekers. A host must always be able to retreat,
    // even from a listing that could no longer be published.
    const read = makeChain({ data: { id: "l1", status: "live", housing_evidence: "not_stated" } });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);

    const result = await updateListingStatus("token", "user_1", "l1", "paused");

    expect(result).toEqual({ ok: true, status: "paused" });
  });

  it("does NOT force a decision on a SOURCED listing (founder decision 4)", async () => {
    // No host exists to make it. Sourced inventory keeps showing "Not stated"
    // until someone claims and confirms it.
    const read = makeChain({
      data: {
        id: "l1",
        status: "paused",
        provenance: "sourced",
        housing_evidence: "not_stated",
        meals_evidence: "not_stated",
        pay_evidence: "not_stated",
      },
    });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);

    const result = await updateListingStatus("token", "user_1", "l1", "live");

    expect(result).toEqual({ ok: true, status: "live" });
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
    expect(patch).toEqual({ status: "paused" }); // paused_at is the trigger's (071)
  });

  it("sends ONLY status — the timestamps are the database's job now (071)", async () => {
    // published_at/paused_at/archived_at moved to trg_listings_status_timestamps.
    // This is not cosmetic: 071 revokes the blanket UPDATE grant that let a host
    // PATCH `provenance` around 070's publication gate, and those three columns
    // are deliberately NOT re-granted — a host must not be able to forge when
    // their listing went live. Sending them from here would now fail with
    // "permission denied for column", so this asserts we don't.
    const read = makeChain({ data: { id: "l1", status: "paused" } });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);

    const result = await updateListingStatus("token", "user_1", "l1", "archived");

    expect(result.ok).toBe(true);
    const patch = (update.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(patch).toEqual({ status: "archived" });
    for (const forged of ["archived_at", "published_at", "paused_at"]) {
      expect(patch).not.toHaveProperty(forged);
    }
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
