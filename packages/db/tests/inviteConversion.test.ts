/**
 * Invite -> application conversion + honest delivery stamping.
 *
 * What these pin:
 *  - ACCEPTING AN INVITE CREATES A REAL APPLICATION. Before this, accept only
 *    walked the invite row to 'applied' and created nothing, so the host was
 *    told someone accepted and found an EMPTY /host/applicants.
 *  - The application is attributed: source='invite' + origin_invite_id.
 *  - ORDER: the application is created BEFORE the invite advances. A refused
 *    application (résumé gate) leaves the invite untouched and actionable —
 *    an invite is a request to apply, never a bypass of the résumé gate.
 *  - DELIVERY IS REAL: fetching the seeker's invite list stamps 'created' rows
 *    as delivered, which is what makes the host's credit-restore rule
 *    (undelivered only — founder policy 2026-07-16) honest.
 *  - Declining never creates an application.
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
vi.mock("../src/client.js", () => ({
  authedClient: () => ({ from: mockFrom }),
}));
vi.mock("../src/adminClient.js", () => ({
  adminClient: () => ({ from: mockAdminFrom }),
}));

const applyToListing = vi.hoisted(() => vi.fn());
vi.mock("../src/queries/applications.js", () => ({ applyToListing }));

import { getSeekerInvites, respondToInvite } from "../src/queries/invites.js";

type Call = { method: string; args: unknown[] };

/** Recording chain stub: captures builder calls, resolves to `result`. */
function makeChain(result: { data?: unknown; error?: unknown }) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  const terminal = () => Promise.resolve({ data: null, error: null, ...result });
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const m of ["select", "update", "insert", "eq", "in", "not", "order"]) {
    chain[m] = record(m);
  }
  chain.maybeSingle = terminal;
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return { chain, calls };
}

const SEEKER_PROFILE = { data: { id: "seeker-1" }, error: null };

beforeEach(() => {
  mockFrom.mockReset();
  mockAdminFrom.mockReset();
  applyToListing.mockReset();
  // Default: the admin (service-role) stamps succeed silently.
  mockAdminFrom.mockImplementation(() => makeChain({ data: null }).chain);
});

describe("respondToInvite — accept creates a real application", () => {
  it("creates an invite-attributed application, then advances the invite", async () => {
    applyToListing.mockResolvedValue({
      ok: true,
      applicationId: "app-new",
      seekerProfileId: "seeker-1",
    });
    const inviteRead = makeChain({
      data: { id: "inv-1", status: "delivered", listing_id: "listing-1" },
    });
    const statusUpdate = makeChain({ data: { id: "inv-1" } });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain) // resolveSeekerProfileId
      .mockReturnValueOnce(inviteRead.chain) // invite load
      .mockReturnValueOnce(statusUpdate.chain); // delivered -> applied

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result.ok).toBe(true);
    expect(result.applicationId).toBe("app-new");
    // The application carries its invite attribution.
    expect(applyToListing).toHaveBeenCalledWith(
      "token",
      "user_1",
      "listing-1",
      undefined,
      { source: "invite", originInviteId: "inv-1" },
    );
    expect(statusUpdate.calls.find((c) => c.method === "update")?.args).toEqual([
      { status: "applied" },
    ]);
  });

  it("walks created -> delivered -> applied when the invite was never delivered", async () => {
    applyToListing.mockResolvedValue({ ok: true, applicationId: "app-new" });
    const updates = [makeChain({ data: { id: "inv-1" } }), makeChain({ data: { id: "inv-1" } })];
    let updateIdx = 0;
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: { id: "inv-1", status: "created", listing_id: "listing-1" } }).chain,
      )
      .mockImplementation(() => updates[updateIdx++].chain);

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result.ok).toBe(true);
    expect(updates[0].calls.find((c) => c.method === "update")?.args).toEqual([
      { status: "delivered" },
    ]);
    expect(updates[1].calls.find((c) => c.method === "update")?.args).toEqual([
      { status: "applied" },
    ]);
  });

  it("RÉSUMÉ GATE: a refused application leaves the invite untouched and actionable", async () => {
    applyToListing.mockResolvedValue({ ok: false, error: "resume_incomplete" });
    const inviteRead = makeChain({
      data: { id: "inv-1", status: "delivered", listing_id: "listing-1" },
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(inviteRead.chain);

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result).toEqual({ ok: false, error: "resume_incomplete" });
    // Only the profile + invite reads happened — the invite never advanced, so
    // the seeker can finish their résumé and accept again.
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("adopts a pre-existing direct application (already_applied is not a failure)", async () => {
    applyToListing.mockResolvedValue({ ok: false, error: "already_applied" });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: { id: "inv-1", status: "viewed", listing_id: "listing-1" } }).chain,
      )
      .mockReturnValueOnce(makeChain({ data: { id: "inv-1" } }).chain);

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    // The invite still closes out — the seeker did apply, just directly.
    expect(result.ok).toBe(true);
  });

  it("stamps responded_at + application_id through the SERVICE ROLE (066 grants status only)", async () => {
    applyToListing.mockResolvedValue({ ok: true, applicationId: "app-new" });
    const adminStamp = makeChain({ data: null });
    mockAdminFrom.mockReturnValue(adminStamp.chain);
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: { id: "inv-1", status: "delivered", listing_id: "listing-1" } }).chain,
      )
      .mockReturnValueOnce(makeChain({ data: { id: "inv-1" } }).chain);

    await respondToInvite("token", "user_1", "inv-1", "accepted");

    const patch = adminStamp.calls.find((c) => c.method === "update")?.args[0] as Record<
      string,
      unknown
    >;
    expect(patch.application_id).toBe("app-new");
    expect(typeof patch.responded_at).toBe("string");
  });

  it("a failed linkage stamp never fails a real acceptance", async () => {
    applyToListing.mockResolvedValue({ ok: true, applicationId: "app-new" });
    mockAdminFrom.mockImplementation(() => {
      throw new Error("service role unavailable");
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: { id: "inv-1", status: "delivered", listing_id: "listing-1" } }).chain,
      )
      .mockReturnValueOnce(makeChain({ data: { id: "inv-1" } }).chain);

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result.ok).toBe(true);
    expect(result.applicationId).toBe("app-new");
  });
});

describe("respondToInvite — decline", () => {
  it("never creates an application", async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: { id: "inv-1", status: "delivered", listing_id: "listing-1" } }).chain,
      )
      .mockReturnValueOnce(makeChain({ data: { id: "inv-1" } }).chain);

    const result = await respondToInvite("token", "user_1", "inv-1", "declined");

    expect(result.ok).toBe(true);
    expect(applyToListing).not.toHaveBeenCalled();
  });
});

describe("getSeekerInvites — delivery stamping makes the credit rule honest", () => {
  it("stamps 'created' invites delivered and reports them as delivered", async () => {
    const listRead = makeChain({
      data: [
        {
          id: "inv-1",
          listing_id: "listing-1",
          host_profile_id: "host-1",
          status: "created",
          message: null,
          created_at: "2026-07-16T00:00:00.000Z",
          expires_at: null,
          listings: null,
          host_profiles: null,
        },
      ],
    });
    const adminStamp = makeChain({ data: null });
    mockAdminFrom.mockReturnValue(adminStamp.chain);
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(listRead.chain);

    const result = await getSeekerInvites("token", "user_1");

    // Stamped: status-scoped so a concurrent withdraw/response is never clobbered.
    expect(adminStamp.calls.find((c) => c.method === "in")?.args).toEqual(["id", ["inv-1"]]);
    expect(adminStamp.calls.find((c) => c.method === "eq")?.args).toEqual(["status", "created"]);
    const patch = adminStamp.calls.find((c) => c.method === "update")?.args[0] as Record<
      string,
      unknown
    >;
    expect(patch.status).toBe("delivered");
    expect(typeof patch.delivered_at).toBe("string");
    // The caller sees what was just written, not the pre-write read.
    expect(result[0].invite.status).toBe("delivered");
  });

  it("writes nothing when every invite was already delivered", async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({
          data: [
            {
              id: "inv-1",
              listing_id: "listing-1",
              host_profile_id: "host-1",
              status: "delivered",
              message: null,
              created_at: "2026-07-16T00:00:00.000Z",
              expires_at: null,
              listings: null,
              host_profiles: null,
            },
          ],
        }).chain,
      );

    const result = await getSeekerInvites("token", "user_1");

    expect(mockAdminFrom).not.toHaveBeenCalled();
    expect(result[0].invite.status).toBe("delivered");
  });

  it("a stamping failure never breaks the seeker's invite list", async () => {
    mockAdminFrom.mockImplementation(() => {
      throw new Error("service role unavailable");
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({
          data: [
            {
              id: "inv-1",
              listing_id: "listing-1",
              host_profile_id: "host-1",
              status: "created",
              message: null,
              created_at: "2026-07-16T00:00:00.000Z",
              expires_at: null,
              listings: null,
              host_profiles: null,
            },
          ],
        }).chain,
      );

    const result = await getSeekerInvites("token", "user_1");

    expect(result).toHaveLength(1);
  });
});
