/**
 * Invite -> application conversion + honest delivery stamping.
 *
 * What these pin:
 *  - ACCEPTING AN INVITE CREATES A REAL APPLICATION. Before this, accept only
 *    walked the invite row to 'applied' and created nothing, so the host was
 *    told someone accepted and found an EMPTY /host/applicants.
 *  - The application is attributed: source='invite' + origin_invite_id.
 *  - ATOMICITY: the 091 RPC owns application + invite acceptance together.
 *    Only a positively marked deploy-before-migration result may use the prior
 *    application-first status/linkage sequence. A refused application leaves
 *    the invite untouched and actionable.
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
const mockAdminRpc = vi.fn();
vi.mock("../src/client.js", () => ({
  authedClient: () => ({ from: mockFrom }),
}));
vi.mock("../src/adminClient.js", () => ({
  adminClient: () => ({ from: mockAdminFrom, rpc: mockAdminRpc }),
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
  for (const m of [
    "select",
    "update",
    "insert",
    "eq",
    "in",
    "not",
    "gt",
    "order",
  ]) {
    chain[m] = record(m);
  }
  chain.maybeSingle = terminal;
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return { chain, calls };
}

const SEEKER_PROFILE = { data: { id: "seeker-1" }, error: null };
const FUTURE_INVITE_EXPIRY = "2099-01-01T00:00:00.000Z";

function actionableInvite(status: "created" | "delivered" | "viewed") {
  return {
    id: "inv-1",
    status,
    listing_id: "listing-1",
    expires_at: FUTURE_INVITE_EXPIRY,
  };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockAdminFrom.mockReset();
  mockAdminRpc.mockReset();
  applyToListing.mockReset();
  // Default: the admin (service-role) stamps succeed silently.
  mockAdminFrom.mockImplementation(() => makeChain({ data: null }).chain);
});

describe("respondToInvite — accept creates a real application", () => {
  it("returns an RPC-created invite application without client-side writes", async () => {
    applyToListing.mockResolvedValue({
      ok: true,
      applicationId: "app-new",
      seekerProfileId: "seeker-1",
      disposition: "created",
    });
    const inviteRead = makeChain({
      data: actionableInvite("delivered"),
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain) // resolveSeekerProfileId
      .mockReturnValueOnce(inviteRead.chain); // invite load; RPC owns mutation

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result.ok).toBe(true);
    expect(result.applicationId).toBe("app-new");
    expect(result.disposition).toBe("created");
    // The application carries its invite attribution.
    expect(applyToListing).toHaveBeenCalledWith(
      "token",
      "user_1",
      "listing-1",
      undefined,
      { source: "invite", originInviteId: "inv-1" },
    );
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("delegates created -> delivered -> applied to the atomic RPC", async () => {
    applyToListing.mockResolvedValue({
      ok: true,
      applicationId: "app-new",
      disposition: "created",
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("created") }).chain,
      );

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result.ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("RÉSUMÉ GATE: a refused application leaves the invite untouched and actionable", async () => {
    applyToListing.mockResolvedValue({ ok: false, error: "resume_incomplete" });
    const inviteRead = makeChain({
      data: actionableInvite("delivered"),
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

  it.each([
    ["expired", "2020-01-01T00:00:00.000Z"],
    ["missing expiry", null],
  ])("rejects an invite with %s before application submission", async (_case, expiresAt) => {
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({
          data: { ...actionableInvite("viewed"), expires_at: expiresAt },
        }).chain,
      );

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result).toEqual({ ok: false, error: "invite_not_actionable" });
    expect(applyToListing).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("does not revive the compatibility path for an unmarked already_applied error", async () => {
    applyToListing.mockResolvedValue({ ok: false, error: "already_applied" });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("viewed") }).chain,
      );

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result).toEqual({ ok: false, error: "already_applied" });
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("adopts a pre-existing direct application without a second invite write", async () => {
    applyToListing.mockResolvedValue({
      ok: true,
      applicationId: "app-existing",
      disposition: "existing",
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("viewed") }).chain,
      );

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result).toMatchObject({
      ok: true,
      applicationId: "app-existing",
      disposition: "existing",
    });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("does not stamp accepted linkage after the RPC already committed it", async () => {
    applyToListing.mockResolvedValue({
      ok: true,
      applicationId: "app-new",
      disposition: "created",
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("delivered") }).chain,
      );

    await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("returns reactivated disposition without a post-RPC status loop", async () => {
    applyToListing.mockResolvedValue({
      ok: true,
      applicationId: "app-new",
      disposition: "reactivated",
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("delivered") }).chain,
      );

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result.ok).toBe(true);
    expect(result.applicationId).toBe("app-new");
    expect(result.disposition).toBe("reactivated");
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("runs status and linkage compatibility only for a marked legacy submission", async () => {
    applyToListing.mockResolvedValue({
      ok: true,
      applicationId: "app-legacy",
      seekerProfileId: "seeker-1",
      disposition: "created",
      legacySubmission: true,
    });
    const delivered = makeChain({ data: { id: "inv-1" }, error: null });
    const applied = makeChain({ data: { id: "inv-1" }, error: null });
    const adminStamp = makeChain({ data: null, error: null });
    mockAdminFrom.mockReturnValue(adminStamp.chain);
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("created") }).chain,
      )
      .mockReturnValueOnce(delivered.chain)
      .mockReturnValueOnce(applied.chain);

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result).toMatchObject({
      ok: true,
      applicationId: "app-legacy",
      disposition: "created",
    });
    expect(delivered.calls.find((call) => call.method === "update")?.args).toEqual([
      { status: "delivered" },
    ]);
    expect(applied.calls.find((call) => call.method === "update")?.args).toEqual([
      { status: "applied" },
    ]);
    expect(adminStamp.calls.find((call) => call.method === "update")?.args[0]).toEqual(
      expect.objectContaining({ application_id: "app-legacy" }),
    );
  });

  it("lets a marked legacy duplicate adopt and link its existing application", async () => {
    applyToListing.mockResolvedValue({
      ok: false,
      error: "already_applied",
      applicationId: "app-existing",
      seekerProfileId: "seeker-1",
      legacySubmission: true,
    });
    const applied = makeChain({ data: { id: "inv-1" }, error: null });
    const adminStamp = makeChain({ data: null, error: null });
    mockAdminFrom.mockReturnValue(adminStamp.chain);
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("viewed") }).chain,
      )
      .mockReturnValueOnce(applied.chain);

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result).toMatchObject({ ok: true, applicationId: "app-existing" });
    expect(result.disposition).toBeUndefined();
    expect(applied.calls.find((call) => call.method === "update")?.args).toEqual([
      { status: "applied" },
    ]);
    expect(adminStamp.calls.find((call) => call.method === "update")?.args[0]).toEqual(
      expect.objectContaining({ application_id: "app-existing" }),
    );
  });

  it("leaves the invite actionable when a legacy duplicate has no recovered application id", async () => {
    applyToListing.mockResolvedValue({
      ok: false,
      error: "already_applied",
      seekerProfileId: "seeker-1",
      legacySubmission: true,
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("viewed") }).chain,
      );

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result).toEqual({ ok: false, error: "already_applied" });
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("conceals a legacy invite-write failure", async () => {
    applyToListing.mockResolvedValue({
      ok: true,
      applicationId: "app-legacy",
      disposition: "created",
      legacySubmission: true,
    });
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("viewed") }).chain,
      )
      .mockReturnValueOnce(
        makeChain({
          data: null,
          error: { message: "private invite policy implementation detail" },
        }).chain,
      );

    const result = await respondToInvite("token", "user_1", "inv-1", "accepted");

    expect(result).toEqual({ ok: false, error: "temporarily_unavailable" });
    expect(JSON.stringify(result)).not.toContain("implementation detail");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });
});

describe("respondToInvite — decline", () => {
  it("never creates an application", async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("delivered") }).chain,
      )
      .mockReturnValueOnce(makeChain({ data: { id: "inv-1" } }).chain);

    const result = await respondToInvite("token", "user_1", "inv-1", "declined");

    expect(result.ok).toBe(true);
    expect(applyToListing).not.toHaveBeenCalled();
  });

  it("conceals invite read and decline write failures", async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({
          data: null,
          error: { message: "private invite read implementation detail" },
        }).chain,
      );

    const readFailure = await respondToInvite(
      "token",
      "user_1",
      "inv-1",
      "declined",
    );

    expect(readFailure).toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });
    expect(JSON.stringify(readFailure)).not.toContain("implementation detail");

    mockFrom
      .mockReturnValueOnce(makeChain(SEEKER_PROFILE).chain)
      .mockReturnValueOnce(
        makeChain({ data: actionableInvite("delivered") }).chain,
      )
      .mockReturnValueOnce(
        makeChain({
          data: null,
          error: { message: "private invite write implementation detail" },
        }).chain,
      );

    const writeFailure = await respondToInvite(
      "token",
      "user_1",
      "inv-1",
      "declined",
    );

    expect(writeFailure).toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });
    expect(JSON.stringify(writeFailure)).not.toContain("implementation detail");
  });
});

describe("getSeekerInvites — authoritative delivery makes the credit rule honest", () => {
  const SEEKER_ID = "10000000-0000-0000-0000-000000000001";
  const INVITE_ID = "20000000-0000-0000-0000-000000000002";
  const LISTING_ID = "30000000-0000-0000-0000-000000000003";
  const HOST_ID = "40000000-0000-0000-0000-000000000004";
  const profile = { data: { id: SEEKER_ID }, error: null };

  function deliveredRow() {
    return {
      id: INVITE_ID,
      listing_id: LISTING_ID,
      host_profile_id: HOST_ID,
      status: "delivered",
      message: null,
      created_at: "2026-07-16T00:00:00.000Z",
      delivered_at: "2026-07-16T00:01:00.000Z",
      expires_at: FUTURE_INVITE_EXPIRY,
      listings: null,
      host_profiles: null,
    };
  }

  it("authorizes delivery in SQL, then re-reads the active row", async () => {
    const candidateRead = makeChain({ data: [{ id: INVITE_ID }] });
    const finalRead = makeChain({ data: [deliveredRow()] });
    mockAdminRpc.mockResolvedValueOnce({
      data: [{ invite_id: INVITE_ID, status: "delivered" }],
      error: null,
    });
    mockAdminFrom.mockReturnValueOnce(candidateRead.chain);
    mockFrom
      .mockReturnValueOnce(makeChain(profile).chain)
      .mockReturnValueOnce(finalRead.chain);

    const result = await getSeekerInvites("token", "user_1");

    expect(mockAdminRpc).toHaveBeenCalledWith("deliver_seeker_invites", {
      p_seeker_profile_id: SEEKER_ID,
      p_invite_ids: [INVITE_ID],
    });
    expect(finalRead.calls.find((call) => call.method === "in")?.args).toEqual([
      "id",
      [INVITE_ID],
    ]);
    expect(result[0]?.invite).toMatchObject({
      id: INVITE_ID,
      status: "delivered",
    });
  });

  it("renders nothing when a concurrent withdrawal wins the row lock", async () => {
    mockAdminRpc.mockResolvedValueOnce({ data: [], error: null });
    mockAdminFrom.mockReturnValueOnce(
      makeChain({ data: [{ id: INVITE_ID }] }).chain,
    );
    mockFrom.mockReturnValueOnce(makeChain(profile).chain);

    await expect(getSeekerInvites("token", "user_1")).resolves.toEqual([]);
    expect(mockFrom).toHaveBeenCalledOnce();
    expect(mockAdminFrom).toHaveBeenCalledOnce();
  });

  it("fails closed while the versioned delivery authority is missing", async () => {
    mockAdminRpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "private schema detail" },
    });
    mockAdminFrom.mockReturnValueOnce(
      makeChain({ data: [{ id: INVITE_ID }] }).chain,
    );
    mockFrom.mockReturnValueOnce(makeChain(profile).chain);

    await expect(getSeekerInvites("token", "user_1")).rejects.toThrow(
      "delivery authority unavailable",
    );
  });

  it("fails closed when the deployed delivery authority is unavailable", async () => {
    mockAdminRpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "private schema detail" },
    });
    mockAdminFrom.mockReturnValueOnce(
      makeChain({ data: [{ id: INVITE_ID }] }).chain,
    );
    mockFrom.mockReturnValueOnce(makeChain(profile).chain);

    await expect(getSeekerInvites("token", "user_1")).rejects.toThrow(
      "delivery authority unavailable",
    );
  });

  it("fails closed on malformed or foreign delivery rows", async () => {
    mockAdminRpc.mockResolvedValueOnce({
      data: [{ invite_id: "50000000-0000-0000-0000-000000000005", status: "delivered" }],
      error: null,
    });
    mockAdminFrom.mockReturnValueOnce(
      makeChain({ data: [{ id: INVITE_ID }] }).chain,
    );
    mockFrom.mockReturnValueOnce(makeChain(profile).chain);

    await expect(getSeekerInvites("token", "user_1")).rejects.toThrow(
      "invalid delivery response",
    );
  });

  it("keeps expiry filters on both reads and lets the locked SQL clock decide", async () => {
    const candidateRead = makeChain({ data: [{ id: INVITE_ID }] });
    mockAdminRpc.mockResolvedValueOnce({ data: [], error: null });
    mockAdminFrom.mockReturnValueOnce(candidateRead.chain);
    mockFrom.mockReturnValueOnce(makeChain(profile).chain);

    await expect(getSeekerInvites("token", "user_1")).resolves.toEqual([]);
    expect(
      candidateRead.calls.filter((call) => call.method === "not").map((call) => call.args),
    ).toContainEqual(["expires_at", "is", null]);
    expect(candidateRead.calls.find((call) => call.method === "gt")?.args[0]).toBe(
      "expires_at",
    );
  });
});
