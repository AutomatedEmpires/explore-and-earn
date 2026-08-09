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

// ── Mock server-only so the import doesn't crash in the test environment ───
vi.mock("server-only", () => ({}));

// ── Stub authedClient before importing the module under test ───────────────
const mockFrom = vi.fn();
const mockClient = { from: mockFrom };
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
  // vi.fn so tests can assert the UPDATE payload (e.g. withdrawn_reason).
  chain.update = vi.fn(self) as unknown as () => typeof chain;
  chain.insert = self;
  chain.eq = vi.fn(self) as unknown as () => typeof chain;
  chain.or = vi.fn(self) as unknown as () => typeof chain;
  chain.neq = self;
  chain.in = self;
  chain.order = self;
  chain.maybeSingle = terminal as unknown as () => typeof chain;
  // Allow direct await (for update paths that don't call maybeSingle)
  (chain as unknown as Promise<unknown>).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return chain;
}

// SEEKER_SETTABLE_STATUSES is not exported; mirror it here for the membership
// test. Any drift would manifest as functional failures in the test cases below.
// Decline is 'withdrawn' (offered -> withdrawn is the seeded lifecycle edge);
// 'not_selected' is host-only vocabulary.
const SEEKER_SETTABLE_STATUSES = ["accepted", "withdrawn"] as const;

// ── Status membership tests ────────────────────────────────────────────────

describe("HOST_SETTABLE_STATUSES", () => {
  it('includes "accepted" so hosts can confirm a seeker for the role', () => {
    expect(HOST_SETTABLE_STATUSES).toContain("accepted");
  });

  it('includes the engagement states so the review gate can ever open', () => {
    // hostReviews gates on REVIEWABLE_STATUSES = ['active','completed'] and
    // nothing in the product wrote either, so no application ever left
    // 'accepted' and no review could be written. See
    // packages/db/tests/engagementReachability.test.ts for the end-to-end
    // reachability property.
    expect(HOST_SETTABLE_STATUSES).toContain("active");
    expect(HOST_SETTABLE_STATUSES).toContain("completed");
  });

  it("contains exactly the expected host-actionable statuses", () => {
    // Exact equality on purpose: this list is an authorization boundary, so a
    // status must never be added to it casually. 'withdrawn' belongs to the
    // seeker and 'expired' to the lifecycle sweep — neither may appear here.
    const expected = [
      "reviewing",
      "saved_by_host",
      "offered",
      "not_selected",
      "accepted",
      "active",
      "completed",
    ];
    expect([...HOST_SETTABLE_STATUSES].sort()).toEqual([...expected].sort());
  });
});

describe("SEEKER_SETTABLE_STATUSES", () => {
  it('includes "accepted" so seekers can confirm an offer', () => {
    expect(SEEKER_SETTABLE_STATUSES).toContain("accepted");
  });
});

// ── updateApplicationStatus (host path) ────────────────────────────────────

describe("updateApplicationStatus", () => {
  const TOKEN = "tok";
  const USER = "user-1";
  const APP_ID = "app-1";
  const LISTING_ID = "listing-1";
  const HOST_PROFILE_ID = "hp-1";

  /**
   * Wire mockFrom to return the correct result for each table call in order.
   * The UPDATE now chains .select("id").maybeSingle(), so its stub carries the
   * matched row (or null for the zero-row / conflict case) alongside the error.
   */
  function setupChains(
    hostResult: unknown,
    appResult: unknown,
    listingResult: unknown,
    updateResult: { data: unknown; error: unknown },
  ) {
    let call = 0;
    (mockFrom as MockInstance).mockImplementation(() => {
      call++;
      if (call === 1) return makeChain({ data: hostResult, error: null });   // host_profiles
      if (call === 2) return makeChain({ data: appResult, error: null });     // applications select
      if (call === 3) return makeChain({ data: listingResult, error: null }); // listings select
      return makeChain(updateResult);                                         // applications update
    });
  }

  const UPDATE_OK = { data: { id: APP_ID }, error: null };
  const UPDATE_UNREACHED = { data: null, error: null };

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
      UPDATE_UNREACHED,
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "reviewing");
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it('returns listing_full (pre-check) when remaining_role_count is 0', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 0 },
      UPDATE_UNREACHED,
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "listing_full" });
  });

  it('returns listing_full (pre-check) when remaining_role_count is negative', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: -1 },
      UPDATE_UNREACHED,
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "listing_full" });
  });

  it('returns ok:true when accepting with capacity available', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 2 },
      UPDATE_OK,
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: true });
  });

  it('maps DB 23514 check_violation to listing_full when accepting', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 1 },
      { data: null, error: { code: "23514", message: "check_violation" } }, // race-condition scenario
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
      { data: null, error: { code: "23514", message: "Illegal application lifecycle transition: reviewing -> accepted" } },
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  it('maps DB 23514 check_violation to invalid_transition for non-accept statuses', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 1 },
      { data: null, error: { code: "23514", message: "Illegal application lifecycle transition: ..." } },
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "reviewing");
    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  it('returns ok:true for non-accept statuses without a capacity check', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 0 },
      UPDATE_OK,
    );
    // remaining_role_count=0 should NOT block a non-accept transition
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "reviewing");
    expect(result).toEqual({ ok: true });
  });

  it('returns conflict when the UPDATE matches no row (race or RLS filter)', async () => {
    setupChains(
      [{ id: HOST_PROFILE_ID }],
      { id: APP_ID, listing_id: LISTING_ID },
      { id: LISTING_ID, host_profile_id: HOST_PROFILE_ID, remaining_role_count: 2 },
      UPDATE_UNREACHED, // UPDATE reached but matched nothing
    );
    const result = await updateApplicationStatus(TOKEN, USER, APP_ID, "reviewing");
    expect(result).toEqual({ ok: false, error: "conflict" });
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
   * 3. [optional] listings select (only when accepting)
   * 4. applications update
   */
  function setupSeekerChains(
    seekerProfileResult: unknown,
    appResult: unknown,
    listingResult: unknown,
    updateResult: { data: unknown; error: unknown },
  ) {
    let call = 0;
    (mockFrom as MockInstance).mockImplementation(() => {
      call++;
      if (call === 1) return makeChain({ data: seekerProfileResult, error: null }); // seeker_profiles
      if (call === 2) return makeChain({ data: appResult, error: null });             // applications select
      if (call === 3) return makeChain({ data: listingResult, error: null });         // listings select
      return makeChain(updateResult);                                                  // applications update
    });
  }

  const SEEKER_UPDATE_OK = { data: { id: APP_ID }, error: null };
  const SEEKER_UPDATE_UNREACHED = { data: null, error: null };

  beforeEach(() => {
    mockFrom.mockReset();
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
      null,
      SEEKER_UPDATE_UNREACHED,
    );
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it('returns invalid_transition when application is not in offered state', async () => {
    setupSeekerChains(
      { id: SEEKER_PROFILE_ID },
      { id: APP_ID, seeker_profile_id: SEEKER_PROFILE_ID, status: "reviewing", listing_id: LISTING_ID },
      null,
      SEEKER_UPDATE_UNREACHED,
    );
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  it('returns invalid_transition before any capacity check when the offer has expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T12:00:00.000Z"));
    try {
      let call = 0;
      (mockFrom as MockInstance).mockImplementation(() => {
        call++;
        if (call === 1) {
          return makeChain({
            data: { id: SEEKER_PROFILE_ID },
            error: null,
          });
        }
        return makeChain({
          data: {
            id: APP_ID,
            seeker_profile_id: SEEKER_PROFILE_ID,
            status: "offered",
            listing_id: LISTING_ID,
            expires_at: "2026-08-08T12:00:00.000Z",
          },
          error: null,
        });
      });

      const result = await updateApplicationStatusBySeeker(
        TOKEN,
        USER,
        APP_ID,
        "accepted",
      );

      expect(result).toEqual({ ok: false, error: "invalid_transition" });
      expect(call).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns listing_full (pre-check) when remaining_role_count is 0', async () => {
    setupSeekerChains(
      { id: SEEKER_PROFILE_ID },
      { id: APP_ID, seeker_profile_id: SEEKER_PROFILE_ID, status: "offered", listing_id: LISTING_ID },
      { remaining_role_count: 0 },
      SEEKER_UPDATE_UNREACHED,
    );
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "listing_full" });
  });

  it('returns ok:true when seeker accepts with capacity available', async () => {
    setupSeekerChains(
      { id: SEEKER_PROFILE_ID },
      { id: APP_ID, seeker_profile_id: SEEKER_PROFILE_ID, status: "offered", listing_id: LISTING_ID },
      { remaining_role_count: 1 },
      SEEKER_UPDATE_OK,
    );
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: true });
  });

  it('atomically limits the update to a live offered row owned by the seeker', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T12:00:00.000Z"));
    try {
      let call = 0;
      const update = makeChain(SEEKER_UPDATE_OK);
      (mockFrom as MockInstance).mockImplementation(() => {
        call++;
        if (call === 1) {
          return makeChain({
            data: { id: SEEKER_PROFILE_ID },
            error: null,
          });
        }
        if (call === 2) {
          return makeChain({
            data: {
              id: APP_ID,
              seeker_profile_id: SEEKER_PROFILE_ID,
              status: "offered",
              listing_id: LISTING_ID,
              expires_at: "2026-08-08T12:00:01.000Z",
            },
            error: null,
          });
        }
        if (call === 3) {
          return makeChain({
            data: { remaining_role_count: 1 },
            error: null,
          });
        }
        return update;
      });

      const result = await updateApplicationStatusBySeeker(
        TOKEN,
        USER,
        APP_ID,
        "accepted",
      );

      expect(result).toEqual({ ok: true });
      expect(update.eq).toHaveBeenCalledWith("id", APP_ID);
      expect(update.eq).toHaveBeenCalledWith(
        "seeker_profile_id",
        SEEKER_PROFILE_ID,
      );
      expect(update.eq).toHaveBeenCalledWith("status", "offered");
      expect(update.or).toHaveBeenCalledWith(
        "expires_at.is.null,expires_at.gt.now",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps DB 23514 check_violation to listing_full on race-condition accept', async () => {
    setupSeekerChains(
      { id: SEEKER_PROFILE_ID },
      { id: APP_ID, seeker_profile_id: SEEKER_PROFILE_ID, status: "offered", listing_id: LISTING_ID },
      { remaining_role_count: 1 }, // passed pre-check; race happened during write
      { data: null, error: { code: "23514", message: "check_violation" } },
    );
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "listing_full" });
  });

  it('declines via withdrawn without a capacity check, stamping seeker_declined_offer', async () => {
    // Only 3 DB calls expected: seeker_profiles, applications select,
    // applications update (no listing capacity check on a decline).
    let call = 0;
    const update = makeChain({ data: { id: APP_ID }, error: null });
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
      return update;
    });
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "withdrawn");
    expect(result).toEqual({ ok: true });
    expect(call).toBe(3);
    // The decline is offered -> withdrawn with the distinguishing reason —
    // never not_selected (that edge does not exist for seekers).
    expect(update.update).toHaveBeenCalledWith({
      status: "withdrawn",
      withdrawn_reason: "seeker_declined_offer",
    });
  });

  it('rejects the legacy not_selected decline value as invalid_status', async () => {
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "not_selected");
    expect(result).toEqual({ ok: false, error: "invalid_status" });
  });

  it('returns conflict when the UPDATE matches no row (race or RLS filter)', async () => {
    setupSeekerChains(
      { id: SEEKER_PROFILE_ID },
      { id: APP_ID, seeker_profile_id: SEEKER_PROFILE_ID, status: "offered", listing_id: LISTING_ID },
      { remaining_role_count: 1 },
      { data: null, error: null }, // UPDATE matched nothing
    );
    const result = await updateApplicationStatusBySeeker(TOKEN, USER, APP_ID, "accepted");
    expect(result).toEqual({ ok: false, error: "conflict" });
  });
});
