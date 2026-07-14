/**
 * Unit tests for the withdrawn -> re-apply REACTIVATION path in
 * applyToListing (migration 063).
 *
 * Founder directive (2026-07-14): a seeker who withdraws an application and
 * later re-applies must NOT be silently locked out. Because
 * applications_listing_seeker_unique (listing_id, seeker_profile_id) still holds
 * the withdrawn row, a naive re-INSERT collides with SQLSTATE 23505. The fix
 * REVIVES the existing withdrawn row in place (status -> 'applied', stamps
 * reactivated_at) instead of inserting a second one, and reports it so the host
 * sees the applicant "applied before".
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
const mockClient = { from: mockFrom };
vi.mock("../src/client.js", () => ({
  authedClient: () => mockClient,
  anonClient: () => mockClient,
}));

// The résumé gate is exercised elsewhere; here we hold it OPEN so every test
// reaches the reactivation/insert branch under test. getSeekerResume is stubbed
// so it never touches the mocked query queue.
vi.mock("../src/queries/seekerResume.js", () => ({
  getSeekerResume: vi.fn(async () => ({})),
}));
vi.mock("../src/lib/resumeCompleteness.js", () => ({
  isSeekerResumeComplete: () => true,
}));

import { applyToListing } from "../src/queries/applications.js";

/** Fluent chain stub resolving to `result` (see withdrawApplication.test.ts). */
function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const terminal = () => Promise.resolve({ data: null, error: null, ...result });
  chain.select = self;
  chain.update = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.eq = self;
  chain.maybeSingle = terminal;
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return chain;
}

/** Queue chains in call order — each `.from()` consumes the next one. */
function queueFromResults(...chains: ReturnType<typeof makeChain>[]) {
  for (const chain of chains) mockFrom.mockReturnValueOnce(chain);
}

const SEEKER_PROFILE = { data: { id: "seeker-1" }, error: null };
/** Self-application guard read: no owner row -> not the seeker's own listing. */
const NOT_OWN_LISTING = { data: null, error: null };

beforeEach(() => {
  mockFrom.mockReset();
});

describe("applyToListing — withdrawn re-apply reactivation (063)", () => {
  it("revives a withdrawn row in place instead of inserting a second (no 23505 lockout)", async () => {
    const existing = makeChain({
      data: { id: "app-1", status: "withdrawn" },
    });
    const update = makeChain({ error: null });
    queueFromResults(
      makeChain(SEEKER_PROFILE), // resolveSeekerProfileId
      makeChain(NOT_OWN_LISTING), // self-application guard
      existing, // existing-application lookup -> withdrawn
      update, // reactivation UPDATE
    );

    const result = await applyToListing("token", "user_1", "listing-1", "hi");

    // Reactivated, not a fresh insert.
    expect(result).toEqual({ ok: true, reactivated: true });
    // The revive was an UPDATE (not an INSERT) on the existing row.
    expect(update.update).toHaveBeenCalledTimes(1);
    expect(existing.insert).not.toHaveBeenCalled();
  });

  it("stamps status='applied' + reactivated_at (the host 'applied before' flag) and clears withdrawn_reason", async () => {
    const existing = makeChain({ data: { id: "app-1", status: "withdrawn" } });
    const update = makeChain({ error: null });
    queueFromResults(
      makeChain(SEEKER_PROFILE),
      makeChain(NOT_OWN_LISTING),
      existing,
      update,
    );

    await applyToListing("token", "user_1", "listing-1", "cover note");

    const patch = (update.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Record<string, unknown>;
    expect(patch.status).toBe("applied");
    expect(typeof patch.reactivated_at).toBe("string");
    expect(patch.withdrawn_reason).toBeNull();
    // The provided cover message rides along on the revive.
    expect(patch.cover_message).toBe("cover note");
  });

  it("still BLOCKS a genuine double-apply when an active (non-withdrawn) row exists", async () => {
    const existing = makeChain({ data: { id: "app-1", status: "applied" } });
    queueFromResults(
      makeChain(SEEKER_PROFILE),
      makeChain(NOT_OWN_LISTING),
      existing,
    );

    const result = await applyToListing("token", "user_1", "listing-1");

    expect(result).toEqual({ ok: false, error: "already_applied" });
    // The guard fires before any update — no reactivation UPDATE was attempted.
    expect(existing.update).not.toHaveBeenCalled();
  });

  it("first-time apply (no existing row) INSERTs a fresh application, not a reactivation", async () => {
    const existing = makeChain({ data: null });
    const insert = makeChain({ error: null });
    queueFromResults(
      makeChain(SEEKER_PROFILE),
      makeChain(NOT_OWN_LISTING),
      existing, // no prior application
      insert, // INSERT path
    );

    const result = await applyToListing("token", "user_1", "listing-1");

    expect(result).toEqual({ ok: true });
    expect(insert.insert).toHaveBeenCalledTimes(1);
  });

  it("maps a lost-race unique violation on the revive UPDATE to already_applied", async () => {
    const existing = makeChain({ data: { id: "app-1", status: "withdrawn" } });
    const update = makeChain({ error: { code: "23505", message: "dup" } });
    queueFromResults(
      makeChain(SEEKER_PROFILE),
      makeChain(NOT_OWN_LISTING),
      existing,
      update,
    );

    const result = await applyToListing("token", "user_1", "listing-1");

    expect(result).toEqual({ ok: false, error: "already_applied" });
  });
});
