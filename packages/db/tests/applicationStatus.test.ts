/**
 * Unit tests for application-status role-count side-effects.
 *
 * Tests cover:
 *  - HOST_SETTABLE_STATUSES includes "accepted" (host can confirm a seeker)
 *  - SEEKER_SETTABLE_STATUSES includes "accepted" (seeker can accept an offer)
 *  - updateApplicationStatus returns listing_full when remaining_role_count <= 0
 *  - updateApplicationStatus returns invalid_status for unknown statuses
 *  - updateApplicationStatus returns forbidden when host doesn't own the listing
 *  - updateApplicationStatusBySeeker returns listing_full when remaining = 0
 *  - updateApplicationStatusBySeeker returns invalid_transition when not offered
 *  - The DB CHECK_VIOLATION (23514) code maps correctly to listing_full /
 *    invalid_transition in both update functions
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import {
  APPLICATION_TRANSITIONS,
  canTransition,
} from "@explore-and-earn/contracts";

// ── Mock server-only so the import doesn't crash in the test environment ───
vi.mock("server-only", () => ({}));

// ── Stub authedClient before importing the module under test ───────────────
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockClient = { from: mockFrom, rpc: mockRpc };
vi.mock("../src/client.js", () => ({
  authedClient: () => mockClient,
}));

// ── Import after mocks are in place ───────────────────────────────────────
import {
  updateApplicationStatus,
  updateApplicationStatusBySeeker,
  HOST_SETTABLE_STATUSES,
} from "../src/queries/applications.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a fluent Supabase query chain stub that resolves to { data, error }.
 * Supports: .from().select().eq()*.maybeSingle() and .from().update().eq()
 */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, () => typeof chain> = {};
  const terminal = () => Promise.resolve(result);
  const self = () => chain;
  chain.select = self;
  chain.update = self;
  chain.insert = self;
  chain.eq = self;
  chain.neq = self;
  chain.in = self;
  chain.order = self;
  chain.maybeSingle = terminal as unknown as () => typeof chain;
  // Allow direct await (for update paths that don't call maybeSingle)
  (chain as unknown as Promise<unknown>).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return chain;
}

// ── Status membership tests ────────────────────────────────────────────────

describe("HOST_SETTABLE_STATUSES", () => {
  it('includes "accepted" so hosts can confirm a seeker for the role', () => {
    expect(HOST_SETTABLE_STATUSES).toContain("accepted");
  });

  it("contains all expected host-actionable statuses", () => {
    const expected = [
      "reviewing",
      "saved_by_host",
      "offered",
      "not_selected",
      "accepted",
    ];
    expect([...HOST_SETTABLE_STATUSES].sort()).toEqual([...expected].sort());
  });
});

describe("seeker offer lifecycle", () => {
  it("uses the canonical offered -> withdrawn edge for a declined offer", () => {
    expect(
      canTransition(APPLICATION_TRANSITIONS, "offered", "withdrawn"),
    ).toBe(true);
    expect(
      canTransition(APPLICATION_TRANSITIONS, "offered", "not_selected"),
    ).toBe(false);
  });
});

// ── updateApplicationStatus (host path) ────────────────────────────────────

describe("updateApplicationStatus", () => {
  const TOKEN = "tok";
  const USER = "user-1";
  const APP_ID = "app-1";
  const LISTING_ID = "listing-1";
  const HOST_PROFILE_ID = "hp-1";

  /** Wire mockFrom to return the correct result for each table call in order. */
  function setupChains(
    hostResult: unknown,
    appResult: unknown,
    listingResult: unknown,
    updateResult: unknown,
  ) {
    let call = 0;
    (mockFrom as MockInstance).mockImplementation(() => {
      call++;
      if (call === 1) return makeChain({ data: hostResult, error: null });   // host_profiles
      if (call === 2) return makeChain({ data: appResult, error: null });     // applications select
      if (call === 3) return makeChain({ data: listingResult, error: null }); // listings select
      return makeChain({ data: null, error: updateResult });                  // applications update
    });
  }

  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('returns invalid_status for an unknown status', async () => {
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "bogus");
    expect(result).toEqual({ ok: false, error: "invalid_status" });
  });

  it('returns profile_not_found when the host has no host_profiles row', async () => {
    (mockFrom as MockInstance).mockReturnValue(
      makeChain({ data: [], error: null }),
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "reviewing");
    expect(result).toEqual({ ok: false, error: "profile_not_found" });
  });

  it('returns not_found when the application does not exist', async () => {
    let call = 0;
    (mockFrom as MockInstance).mockImplementation(() => {
      call++;
      if (call === 1) return makeChain({ data: [{ id: HOST_PROFILE_ID }], error: null });
      return makeChain({ data: null, error: null }); // maybeSingle returns null
    });
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "reviewing");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it('returns forbidden when the host does not own the listing', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: "other-hp", remaining_role_count: 1 },
      null,
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "reviewing");
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it('returns listing_full (pre-check) when remaining_role_count is 0', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 0 },
      null,
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "listing_full" });
  });

  it('returns listing_full (pre-check) when remaining_role_count is negative', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: -1 },
      null,
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "listing_full" });
  });

  it('returns ok:true when accepting with capacity available', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 2 },
      null, // no update error
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: true });
  });

  it('maps DB 23514 check_violation to listing_full when accepting', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 1 },
      { code: "23514", message: "check_violation" }, // race-condition scenario
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "listing_full" });
  });

  it('maps lifecycle-guard 23514 to invalid_transition even when newStatus is accepted', async () => {
    // Simulates the rare case where the pre-check passed (remaining=1) but the
    // DB lifecycle guard rejects the transition (message starts with "Illegal ").
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 1 },
      { code: "23514", message: "Illegal application lifecycle transition: reviewing -> accepted" },
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  it('maps DB 23514 check_violation to invalid_transition for non-accept statuses', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 1 },
      { code: "23514", message: "Illegal application lifecycle transition: ..." },
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "reviewing");
    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  it('returns ok:true for non-accept statuses without a capacity check', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 0 },
      null,
    );
    // remaining_role_count=0 should NOT block a non-accept transition
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "reviewing");
    expect(result).toEqual({ ok: true });
  });
});

// ── updateApplicationStatusBySeeker (seeker path) ─────────────────────────

describe("updateApplicationStatusBySeeker", () => {
  const TOKEN = "tok";
  const USER = "user-2";
  const APP_ID = "app-2";
  const LISTING_ID = "listing-2";
  const SEEKER_PROFILE_ID = "sp-1";

  /**
   * Wire mockFrom to handle the seeker path:
   * 1. seeker_profiles (resolve profile id)
   * 2. applications select
   * The final mutation is the scoped seeker_transition_application RPC.
   */
  function setupSeekerChains(
    seekerProfileResult: unknown,
    appResult: unknown,
  ) {
    let call = 0;
    (mockFrom as MockInstance).mockImplementation(() => {
      call++;
      if (call === 1) return makeChain({ data: seekerProfileResult, error: null }); // seeker_profiles
      return makeChain({ data: appResult, error: null }); // applications select
    });
  }

  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('returns invalid_status for an unknown status', async () => {
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "bogus");
    expect(result).toEqual({ ok: false, error: "invalid_status" });
  });

  it('returns profile_not_found when no seeker_profiles row exists', async () => {
    (mockFrom as MockInstance).mockReturnValue(makeChain({ data: null, error: null }));
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "profile_not_found" });
  });

  it('returns not_found when the application does not exist', async () => {
    let call = 0;
    (mockFrom as MockInstance).mockImplementation(() => {
      call++;
      if (call === 1) return makeChain({ data: { id: SEEKER_PROFILE_ID }, error: null });
      return makeChain({ data: null, error: null });
    });
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it('returns forbidden when the application belongs to another seeker', async () => {
    setupSeekerChains(
      { id: SEEKER_PROFILE_ID },
      { id: APP_ID, seeker_profile_id: "other-sp", status: "offered", listing_id: LISTING_ID },
    );
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it('returns invalid_transition when application is not in offered state', async () => {
    setupSeekerChains(
      { id: SEEKER_PROFILE_ID },
      { id: APP_ID, seeker_profile_id: SEEKER_PROFILE_ID, status: "reviewing", listing_id: LISTING_ID },
    );
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  it("delegates acceptance and its capacity decision to the atomic RPC", async () => {
    setupSeekerChains(
      { id: SEEKER_PROFILE_ID },
      { id: APP_ID, seeker_profile_id: SEEKER_PROFILE_ID, status: "offered", listing_id: LISTING_ID },
    );
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenCalledWith("seeker_transition_application", {
      p_application_id: APP_ID,
      p_intent: "accept_offer",
    });
  });

  it("surfaces an atomic RPC listing_full result", async () => {
    setupSeekerChains(
      { id: SEEKER_PROFILE_ID },
      { id: APP_ID, seeker_profile_id: SEEKER_PROFILE_ID, status: "offered", listing_id: LISTING_ID },
    );
    mockRpc.mockResolvedValue({
      data: { ok: false, error: "listing_full" },
      error: null,
    });
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "listing_full" });
  });

  it("rejects seeker-written not_selected because that outcome belongs to the host", async () => {
    (mockFrom as MockInstance).mockReturnValue(
      makeChain({ data: null, error: null }),
    );

    const result = await updateApplicationStatusBySeeker(
      TOKEN,
      USER,
      APP_ID,
      "not_selected",
    );

    expect(result).toEqual({ ok: false, error: "invalid_status" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("declines an offer through the scoped RPC with no capacity pre-query", async () => {
    // Only two table reads are expected: seeker profile + application.
    let call = 0;
    (mockFrom as MockInstance).mockImplementation(() => {
      call++;
      if (call === 1) return makeChain({ data: { id: SEEKER_PROFILE_ID }, error: null });
      if (call === 2)
        return makeChain({
          data: {
            id: APP_ID,
            seeker_profile_id: SEEKER_PROFILE_ID,
            status: "offered",
            listing_id: LISTING_ID,
          },
          error: null,
        });
      return makeChain({ data: null, error: null });
    });
    const result = await updateApplicationStatusBySeeker(
      TOKEN,
      USER,
      APP_ID,
      "withdrawn",
    );
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("seeker_transition_application", {
      p_application_id: APP_ID,
      p_intent: "decline_offer",
    });
    expect(call).toBe(2);
  });

  it("maps a lifecycle race while declining to invalid_transition", async () => {
    let call = 0;
    (mockFrom as MockInstance).mockImplementation(() => {
      call++;
      if (call === 1) {
        return makeChain({ data: { id: SEEKER_PROFILE_ID }, error: null });
      }
      if (call === 2) {
        return makeChain({
          data: {
            id: APP_ID,
            seeker_profile_id: SEEKER_PROFILE_ID,
            status: "offered",
            listing_id: LISTING_ID,
          },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });
    mockRpc.mockResolvedValue({
      data: { ok: false, error: "invalid_transition" },
      error: null,
    });

    const result = await updateApplicationStatusBySeeker(
      TOKEN,
      USER,
      APP_ID,
      "withdrawn",
    );

    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });
});
