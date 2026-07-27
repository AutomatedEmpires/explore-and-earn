/**
 * Unit tests for the host listing lifecycle:
 *  - canTransitionListing pins the full transition map, INCLUDING the
 *    under_review -> live edge hosts publish through (founder, 2026-07-26) and
 *    the closed -> draft edge that stops a rejected listing being an orphan
 *  - updateListingStatus enforces ownership, transition validity, and the
 *    PLAN_ENTITLEMENTS listing cap at every transition that newly consumes a
 *    slot: draft -> under_review AND under_review -> live
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

const ALL_STATUSES: readonly ListingStatus[] = [
  "draft",
  "under_review",
  "live",
  "paused",
  "closed",
  "archived",
];

describe("canTransitionListing", () => {
  const ALLOWED: ReadonlyArray<[ListingStatus, ListingStatus]> = [
    ["draft", "under_review"],
    ["under_review", "draft"],
    ["under_review", "live"],
    ["live", "paused"],
    ["live", "archived"],
    ["paused", "live"],
    ["paused", "archived"],
    ["closed", "draft"],
  ];

  it.each(ALLOWED)("allows %s -> %s", (from, to) => {
    expect(canTransitionListing(from, to)).toBe(true);
  });

  it("ALLOWS under_review -> live — hosts publish their own listings (founder, 2026-07-26)", () => {
    expect(canTransitionListing("under_review", "live")).toBe(true);
  });

  // The negative control for the whole change. Publication is a deliberate
  // second act: it is the transition 070's triad CHECK and 072's housing-photo
  // trigger are attached to, and skipping straight from the form would skip the
  // moment the host is shown what is still unanswered.
  it("STILL forbids draft -> live", () => {
    expect(canTransitionListing("draft", "live")).toBe(false);
  });

  it("gives a closed listing exactly ONE exit, and it is not back to public", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransitionListing("closed", to)).toBe(to === "draft");
    }
  });

  it("treats archived as terminal", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransitionListing("archived", to)).toBe(false);
    }
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

/** The same listing one step later: complete, staged, not yet public. */
const ANSWERED_READY = { ...ANSWERED_DRAFT, status: "under_review" } as const;

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
    // The old behaviour floored 'none' at the starter allowance, which was a
    // free tier: one active listing for a host who had never paid, while the FAQ
    // said a plan was required. Founder, 2026-07-26: there is no free tier, so
    // the refusal lands at ZERO active listings, not one. The allowance comes
    // from the RPC the enforcement trigger shares — see lib/entitlements.ts.
    //
    // THE REASON IS NOW NAMED SEPARATELY. Commercial redesign D6 (migration 086)
    // lets a host with no plan hold a workspace, so this is a routine path rather
    // than an impossible one, and 'listing_cap_reached' told them to pause a
    // listing they do not have and upgrade a plan they never bought.
    const read = makeChain({ data: { ...ANSWERED_DRAFT } });
    queueFromResults(HOST_PROFILE, read);
    mockRpc.mockResolvedValueOnce(allowanceState("none", 0, 0));

    const result = await updateListingStatus("token", "user_1", "l1", "under_review");

    expect(result).toEqual({ ok: false, error: "listing_plan_required" });
  });

  it("keeps the two refusals apart — a paid host at their cap is not planless", async () => {
    // The negative control for the split above. A starter host who has spent
    // their allowance gets the CAP sentence, because pausing or upgrading is
    // advice they can actually act on.
    const read = makeChain({ data: { ...ANSWERED_DRAFT } });
    queueFromResults(HOST_PROFILE, read);
    mockRpc.mockResolvedValueOnce(allowanceState("starter", 1, 1));

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

  it("returns invalid_transition for a forbidden edge (draft -> live)", async () => {
    const read = makeChain({ data: { ...ANSWERED_DRAFT } });
    queueFromResults(HOST_PROFILE, read);

    const result = await updateListingStatus("token", "user_1", "l1", "live");

    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  // ── Host self-publish (founder, 2026-07-26) ──────────────────────────────

  it("PUBLISHES an under_review listing — no admin approval stands in the way", async () => {
    const read = makeChain({ data: { ...ANSWERED_READY } });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);

    const result = await updateListingStatus("token", "user_1", "l1", "live");

    expect(result).toEqual({ ok: true, status: "live" });
    expect(update.update).toHaveBeenCalledWith({ status: "live" });
  });

  it("BLOCKS publishing when a benefit went unanswered — the gate moved WITH the edge", async () => {
    // The publication gate used to be reachable only at draft->under_review and
    // paused->live. If under_review->live were added without extending it, the
    // brand-new host path would be the one path that never runs it.
    const read = makeChain({
      data: { ...ANSWERED_READY, pay_evidence: "not_stated" },
    });
    queueFromResults(HOST_PROFILE, read);

    const result = await updateListingStatus("token", "user_1", "l1", "live");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("incomplete_listing");
    expect(result.blockers?.map((b) => b.field)).toEqual(["pay"]);
  });

  /**
   * THE SLOT IS CHARGED AT SUBMIT, WHICH IS WHY PUBLISH IS FREE.
   *
   * This case used to assert the opposite — that under_review -> live is itself
   * cap-checked — because under_review did not count toward the allowance, so
   * charging only draft -> under_review would have let a host queue any number
   * of listings under a cap of one and publish them all. The reconciliation with
   * the entitlements workstream answers that hole one level down: under_review
   * IS a counted status now, in the application (lib/entitlements.ts) and in the
   * database (083's private.host_active_listing_count). Entering review is what
   * spends the slot.
   *
   * So the invariant is the pair below, and BOTH halves are load-bearing: the
   * host at their allowance is refused at submit, and the host who already spent
   * a slot is not charged a second time for publishing what they hold. Refusing
   * the publish edge as well would strand a listing at under_review — paid for,
   * unpublishable — for every host sitting exactly at their allowance, which is
   * every starter host with one listing.
   */
  it("charges the slot at SUBMIT — a host at their allowance cannot enter review", async () => {
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

  it("does NOT charge again at publish — the slot was spent entering review", async () => {
    const read = makeChain({ data: { ...ANSWERED_READY } });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);
    // Deliberately at the allowance: a starter host with their one listing in
    // review must still be able to publish it.
    mockRpc.mockResolvedValue(
      allowanceState(
        "starter",
        PLAN_ENTITLEMENTS.starter.listings,
        PLAN_ENTITLEMENTS.starter.listings,
      ),
    );

    const result = await updateListingStatus("token", "user_1", "l1", "live");

    expect(result).toEqual({ ok: true, status: "live" });
    // The allowance RPC is not even consulted: both statuses are counted.
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("REOPENS a closed listing as a draft", async () => {
    const read = makeChain({
      data: { id: "l1", status: "closed", provenance: "verified" },
    });
    const update = makeChain({ data: { id: "l1" } });
    queueFromResults(HOST_PROFILE, read, update);

    const result = await updateListingStatus("token", "user_1", "l1", "draft");

    expect(result).toEqual({ ok: true, status: "draft" });
    expect(update.update).toHaveBeenCalledWith({ status: "draft" });
    // No triad check and no cap read: draft is neither a publication status nor
    // a cap-counted one.
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  it("REFUSES to reopen a SOURCED closed listing — the origin withdrew that posting", async () => {
    // sweepStaleSourcedListings and the snapshot reconciliation both close
    // sourced rows. Reopening one would resurrect, under our own source
    // attribution, a job the source itself took down. Migration 082 refuses it
    // too; this is the message the host actually reads.
    const read = makeChain({
      data: { id: "l1", status: "closed", provenance: "sourced" },
    });
    queueFromResults(HOST_PROFILE, read);

    const result = await updateListingStatus("token", "user_1", "l1", "draft");

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
