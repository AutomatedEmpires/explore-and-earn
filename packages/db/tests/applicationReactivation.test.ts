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
const mockRpc = vi.fn();
const mockClient = { from: mockFrom, rpc: mockRpc };
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
  chain.single = terminal;
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return chain;
}

/** Queue chains in call order — each `.from()` consumes the next one. */
function queueFromResults(...chains: ReturnType<typeof makeChain>[]) {
  for (const chain of chains) mockFrom.mockReturnValueOnce(chain);
}

const SEEKER_PROFILE = { data: { id: "seeker-1" }, error: null };
const ACCEPTING_LISTING = {
  data: {
    status: "live",
    expires_at: "2099-01-01T00:00:00.000Z",
    provenance: "verified",
    host_profile_id: "host-1",
    host_profiles: { clerk_user_id: "host_user" },
  },
  error: null,
};

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("applyToListing — withdrawn re-apply reactivation (063)", () => {
  it("reports the authoritative RPC reactivation disposition", async () => {
    queueFromResults(makeChain(SEEKER_PROFILE), makeChain(ACCEPTING_LISTING));
    mockRpc.mockReturnValue(
      makeChain({
        data: {
          application_id: "app-1",
          seeker_profile_id: "seeker-1",
          listing_id: "listing-1",
          disposition: "reactivated",
        },
      }),
    );

    const result = await applyToListing("token", "user_1", "listing-1", "hi");

    expect(result).toEqual({
      ok: true,
      reactivated: true,
      applicationId: "app-1",
      seekerProfileId: "seeker-1",
      disposition: "reactivated",
    });
  });

  it("reactivates through the marked bridge when the RPC is not deployed yet", async () => {
    const existing = makeChain({ data: { id: "app-1", status: "withdrawn" } });
    const updated = makeChain({ data: { id: "app-1" }, error: null });
    queueFromResults(
      makeChain(SEEKER_PROFILE),
      makeChain(ACCEPTING_LISTING),
      existing,
      updated,
    );
    mockRpc.mockReturnValue(
      makeChain({
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.submit_my_application in the schema cache",
        },
      }),
    );

    const result = await applyToListing("token", "user_1", "listing-1", "hi");

    expect(result).toMatchObject({
      ok: true,
      reactivated: true,
      legacySubmission: true,
      disposition: "reactivated",
      applicationId: "app-1",
    });
    expect(updated.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "applied",
        withdrawn_reason: null,
        cover_message: "hi",
      }),
    );
  });

  it("passes cover and invite attribution only to submit_my_application", async () => {
    queueFromResults(makeChain(SEEKER_PROFILE), makeChain(ACCEPTING_LISTING));
    mockRpc.mockReturnValue(
      makeChain({
        data: {
          application_id: "app-1",
          seeker_profile_id: "seeker-1",
          listing_id: "listing-1",
          disposition: "reactivated",
        },
      }),
    );

    await applyToListing("token", "user_1", "listing-1", "cover note", {
      source: "invite",
      originInviteId: "invite-1",
    });

    expect(mockRpc).toHaveBeenCalledWith("submit_my_application", {
      p_listing_id: "listing-1",
      p_cover_message: "cover note",
      p_origin_invite_id: "invite-1",
    });
  });

  it("keeps direct active duplicates as already_applied", async () => {
    queueFromResults(makeChain(SEEKER_PROFILE), makeChain(ACCEPTING_LISTING));
    mockRpc.mockReturnValue(
      makeChain({ error: { code: "23505", message: "already_applied" } }),
    );

    const result = await applyToListing("token", "user_1", "listing-1");

    expect(result).toEqual({ ok: false, error: "already_applied" });
  });

  it("reports a newly created application from the RPC", async () => {
    queueFromResults(makeChain(SEEKER_PROFILE), makeChain(ACCEPTING_LISTING));
    mockRpc.mockReturnValue(
      makeChain({
        data: {
          application_id: "app-new",
          seeker_profile_id: "seeker-1",
          listing_id: "listing-1",
          disposition: "created",
        },
      }),
    );

    const result = await applyToListing("token", "user_1", "listing-1");

    expect(result).toEqual({
      ok: true,
      applicationId: "app-new",
      seekerProfileId: "seeker-1",
      disposition: "created",
    });
  });

  it("accepts existing only for invite adoption without marking a reactivation", async () => {
    queueFromResults(makeChain(SEEKER_PROFILE), makeChain(ACCEPTING_LISTING));
    mockRpc.mockReturnValue(
      makeChain({
        data: {
          application_id: "app-1",
          seeker_profile_id: "seeker-1",
          listing_id: "listing-1",
          disposition: "existing",
        },
      }),
    );

    const result = await applyToListing("token", "user_1", "listing-1", undefined, {
      source: "invite",
      originInviteId: "invite-1",
    });

    expect(result).toEqual({
      ok: true,
      applicationId: "app-1",
      seekerProfileId: "seeker-1",
      disposition: "existing",
    });
  });

  it.each([
    ["listing", "different-listing", "seeker-1"],
    ["seeker", "listing-1", "different-seeker"],
  ])(
    "returns conflict for a mismatched RPC %s",
    async (_field, returnedListing, returnedSeeker) => {
      queueFromResults(makeChain(SEEKER_PROFILE), makeChain(ACCEPTING_LISTING));
      mockRpc.mockReturnValue(
        makeChain({
          data: {
            application_id: "app-1",
            seeker_profile_id: returnedSeeker,
            listing_id: returnedListing,
            disposition: "reactivated",
          },
        }),
      );

      const result = await applyToListing("token", "user_1", "listing-1");

      expect(result).toEqual({ ok: false, error: "conflict" });
    },
  );
});
