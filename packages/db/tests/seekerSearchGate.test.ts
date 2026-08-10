/**
 * Regression tests for the host seeker-discovery bridge.
 *
 * A Clerk-JWT client may prove only the current host profile and an eligible
 * owned listing. Candidate rows must come from the service-role-only RPC; a
 * direct seeker_profiles read would be both RLS-dead and a privacy regression.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  authedRpc: vi.fn(),
  authedClient: vi.fn(),
  adminClient: vi.fn(),
}));

const authedDb = { from: mocks.from, rpc: mocks.authedRpc };
const adminDb = { rpc: mocks.rpc };

vi.mock("../src/client.js", () => ({
  authedClient: mocks.authedClient,
}));
vi.mock("../src/adminClient.js", () => ({
  adminClient: mocks.adminClient,
}));

import {
  getHostInvites,
  searchSeekersForInvite,
  withdrawInvite,
} from "../src/queries/invites.js";

const TOKEN = "token";
const USER = "user_1";
const HOST_ID = "10000000-0000-0000-0000-000000000001";
const LISTING_ID = "20000000-0000-0000-0000-000000000002";
const SEEKER_ID = "30000000-0000-0000-0000-000000000003";
const INVITE_ID = "40000000-0000-0000-0000-000000000004";

function filterChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);
  return chain;
}

function eligibleAuthedReads() {
  const host = filterChain({ data: { id: HOST_ID }, error: null });
  const listing = filterChain({ data: { id: LISTING_ID }, error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === "host_profiles") return host;
    if (table === "listings") return listing;
    throw new Error(`unexpected direct table query: ${table}`);
  });
  return { host, listing };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authedClient.mockReturnValue(authedDb);
  mocks.adminClient.mockReturnValue(adminDb);
});

describe("searchSeekersForInvite", () => {
  it("rejects malformed input before any client is created", async () => {
    await expect(
      searchSeekersForInvite(TOKEN, USER, "not-a-uuid", "anna"),
    ).resolves.toEqual({ ok: false, error: "invalid_request" });
    await expect(
      searchSeekersForInvite(TOKEN, USER, LISTING_ID, "a"),
    ).resolves.toEqual({ ok: false, error: "invalid_request" });
    await expect(
      searchSeekersForInvite(TOKEN, USER, LISTING_ID, "x".repeat(101)),
    ).resolves.toEqual({ ok: false, error: "invalid_request" });

    expect(mocks.authedClient).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("returns listing_unavailable for a caller without a host and never opens the admin path", async () => {
    mocks.from.mockReturnValue(filterChain({ data: null, error: null }));

    const result = await searchSeekersForInvite(TOKEN, USER, LISTING_ID, "anna");

    expect(result).toEqual({ ok: false, error: "listing_unavailable" });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("host_profiles");
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("proves host/listing ownership with the JWT client, then calls only the service RPC", async () => {
    const { listing } = eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({
      data: [
        {
          seeker_profile_id: SEEKER_ID,
          display_name: "  Anna Trail  ",
          short_bio: "  Orchard lead  ",
          already_invited: true,
        },
      ],
      error: null,
    });

    const result = await searchSeekersForInvite(
      TOKEN,
      USER,
      LISTING_ID,
      "  Anna   Trail  ",
    );

    expect(result).toEqual({
      ok: true,
      seekers: [
        {
          seekerProfileId: SEEKER_ID,
          displayName: "Anna Trail",
          bio: "Orchard lead",
          alreadyInvited: true,
        },
      ],
    });
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      "host_profiles",
      "listings",
    ]);
    expect(mocks.from).not.toHaveBeenCalledWith("seeker_profiles");
    expect(listing.eq).toHaveBeenCalledWith("id", LISTING_ID);
    expect(listing.eq).toHaveBeenCalledWith("host_profile_id", HOST_ID);
    expect(listing.eq).toHaveBeenCalledWith("status", "live");
    expect(listing.eq).toHaveBeenCalledWith("provenance", "verified");
    expect(listing.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    expect(mocks.rpc).toHaveBeenCalledWith("search_host_sourceable_seekers", {
      p_host_profile_id: HOST_ID,
      p_listing_id: LISTING_ID,
      p_query: "Anna Trail",
      p_limit: 20,
    });
  });

  it("preserves a successful empty result instead of treating it as failure", async () => {
    eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await expect(
      searchSeekersForInvite(TOKEN, USER, LISTING_ID, "nobody"),
    ).resolves.toEqual({ ok: true, seekers: [] });
  });

  it("passes wildcard characters as literal query text for SQL-side literal search", async () => {
    eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await searchSeekersForInvite(TOKEN, USER, LISTING_ID, "%_");

    expect(mocks.rpc).toHaveBeenCalledWith(
      "search_host_sourceable_seekers",
      expect.objectContaining({ p_query: "%_" }),
    );
  });

  it.each([
    [{ code: "22023", message: "invalid_request" }, "invalid_request"],
    [{ code: "42501", message: "listing_unavailable" }, "listing_unavailable"],
    [{ code: "42501", message: "permission denied for function" }, "temporarily_unavailable"],
    [{ code: "22023", message: "value out of range" }, "temporarily_unavailable"],
    [{ code: "XX000", message: "private database detail" }, "temporarily_unavailable"],
  ] as const)("maps RPC failure %# to a safe error", async (rpcError, expected) => {
    eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({ data: null, error: rpcError });

    await expect(
      searchSeekersForInvite(TOKEN, USER, LISTING_ID, "anna"),
    ).resolves.toEqual({ ok: false, error: expected });
  });

  it("fails closed on a malformed RPC row instead of returning partial candidates", async () => {
    eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({
      data: [
        {
          seeker_profile_id: SEEKER_ID,
          display_name: "Anna",
          short_bio: null,
          already_invited: "false",
        },
      ],
      error: null,
    });

    await expect(
      searchSeekersForInvite(TOKEN, USER, LISTING_ID, "anna"),
    ).resolves.toEqual({ ok: false, error: "temporarily_unavailable" });
  });

  it("does not collapse an authenticated listing read failure to empty", async () => {
    const host = filterChain({ data: { id: HOST_ID }, error: null });
    const listing = filterChain({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    mocks.from.mockImplementation((table: string) =>
      table === "host_profiles" ? host : listing,
    );

    await expect(
      searchSeekersForInvite(TOKEN, USER, LISTING_ID, "anna"),
    ).resolves.toEqual({ ok: false, error: "temporarily_unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("withdrawInvite authority bridge", () => {
  it("rejects malformed ids before opening either client", async () => {
    await expect(withdrawInvite(TOKEN, USER, "not-a-uuid")).resolves.toEqual({
      ok: false,
      error: "invalid_request",
    });
    expect(mocks.authedClient).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("proves the host identity, then strictly decodes the atomic service RPC", async () => {
    mocks.from.mockReturnValue(
      filterChain({ data: { id: HOST_ID }, error: null }),
    );
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        invite_id: INVITE_ID,
        disposition: "withdrawn",
        credit_restored: true,
      },
      error: null,
    });

    await expect(withdrawInvite(TOKEN, USER, INVITE_ID)).resolves.toEqual({
      ok: true,
      disposition: "withdrawn",
      creditRestored: true,
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("host_profiles");
    expect(mocks.rpc).toHaveBeenCalledWith("withdraw_host_invite", {
      p_host_profile_id: HOST_ID,
      p_invite_id: INVITE_ID,
    });
  });

  it("normalizes an uppercase UUID before RPC and canonical response comparison", async () => {
    const uppercase = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    const canonical = uppercase.toLowerCase();
    mocks.from.mockReturnValue(
      filterChain({ data: { id: HOST_ID }, error: null }),
    );
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        invite_id: canonical,
        disposition: "already_withdrawn",
        credit_restored: false,
      },
      error: null,
    });

    await expect(withdrawInvite(TOKEN, USER, uppercase)).resolves.toEqual({
      ok: true,
      disposition: "already_withdrawn",
      creditRestored: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "withdraw_host_invite",
      expect.objectContaining({ p_invite_id: canonical }),
    );
  });

  it.each([
    [{ ok: false, error: "invite_not_withdrawable" }, "invite_not_withdrawable"],
	[{ ok: false, error: "invite_delivery_in_progress" }, "invite_delivery_in_progress"],
    [{ ok: false, error: "private_detail" }, "temporarily_unavailable"],
    [{ ok: true, invite_id: "wrong", disposition: "withdrawn", credit_restored: true }, "temporarily_unavailable"],
  ] as const)("maps RPC payload %# to a stable result", async (data, error) => {
    mocks.from.mockReturnValue(
      filterChain({ data: { id: HOST_ID }, error: null }),
    );
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    await expect(withdrawInvite(TOKEN, USER, INVITE_ID)).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it("conceals transport errors and never falls back to direct invite updates", async () => {
    mocks.from.mockReturnValue(
      filterChain({ data: { id: HOST_ID }, error: null }),
    );
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private schema detail" },
    });

    await expect(withdrawInvite(TOKEN, USER, INVITE_ID)).resolves.toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });
    expect(mocks.from).not.toHaveBeenCalledWith("invites");
  });
});

describe("getHostInvites seeker-name bridge", () => {
  function hostInviteReads() {
    const host = filterChain({ data: { id: HOST_ID }, error: null });
    const invites = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              id: "40000000-0000-0000-0000-000000000004",
              listing_id: LISTING_ID,
              seeker_profile_id: SEEKER_ID,
              status: "created",
              message: null,
              created_at: "2026-08-09T12:00:00.000Z",
              listings: { title: "Orchard crew" },
            },
          ],
          error: null,
        }),
      ),
    };
    invites.select.mockReturnValue(invites);
    invites.eq.mockReturnValue(invites);
    mocks.from.mockImplementation((table: string) => {
      if (table === "host_profiles") return host;
      if (table === "invites") return invites;
      throw new Error(`unexpected direct table query: ${table}`);
    });
    return invites;
  }

  it("resolves invite-party names through the bounded bridge, never a child-table join", async () => {
    const invites = hostInviteReads();
    mocks.authedRpc.mockResolvedValueOnce({
      data: [{ seeker_profile_id: SEEKER_ID, display_name: "Avery Nguyen" }],
      error: null,
    });

    await expect(getHostInvites(TOKEN, USER)).resolves.toEqual([
      expect.objectContaining({
        seekerProfileId: SEEKER_ID,
        seekerDisplayName: "Avery Nguyen",
      }),
    ]);
    expect(invites.select).toHaveBeenCalledWith(
      expect.not.stringContaining("seeker_profiles"),
    );
    expect(mocks.from).not.toHaveBeenCalledWith("seeker_profiles");
    expect(mocks.authedRpc).toHaveBeenCalledWith(
      "get_host_applicant_display_names",
      { p_seeker_profile_ids: [SEEKER_ID] },
    );
  });

  it("renders a lookup outage as unavailable, not as an anonymous answer", async () => {
    hostInviteReads();
    mocks.authedRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "bridge unavailable" },
    });

    const result = await getHostInvites(TOKEN, USER);
    expect(result[0]?.seekerDisplayName).toBe("Name unavailable");
    expect(result[0]?.seekerDisplayName).not.toBe("Anonymous seeker");
  });
});
