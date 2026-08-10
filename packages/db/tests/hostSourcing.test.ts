/** Unit coverage for the service-only matched-seeker discovery bridge. */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  authedClient: vi.fn(),
  adminClient: vi.fn(),
}));

const authedDb = { from: mocks.from };
const adminDb = { rpc: mocks.rpc };

vi.mock("../src/client.js", () => ({ authedClient: mocks.authedClient }));
vi.mock("../src/adminClient.js", () => ({ adminClient: mocks.adminClient }));

import { getMatchedSeekersForListing } from "../src/queries/hostSourcing.js";

const TOKEN = "token";
const USER = "user_1";
const HOST_ID = "10000000-0000-0000-0000-000000000001";
const LISTING_ID = "20000000-0000-0000-0000-000000000002";
const SEEKER_ID = "30000000-0000-0000-0000-000000000003";

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
  return { listing };
}

function sourcedRow(overrides: Record<string, unknown> = {}) {
  return {
    seeker_profile_id: SEEKER_ID,
    display_name: "  Anna Trail  ",
    short_bio: "  Orchard lead  ",
    general_skill_tags: [" harvest ", "crew lead"],
    desired_categories: ["farm"],
    score: 82,
    band: "strong",
    already_invited: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authedClient.mockReturnValue(authedDb);
  mocks.adminClient.mockReturnValue(adminDb);
});

describe("getMatchedSeekersForListing", () => {
  it.each([
    ["not-a-uuid", 12],
    [LISTING_ID, 0],
    [LISTING_ID, 51],
    [LISTING_ID, 1.5],
  ] as const)("rejects invalid listing/limit input (%s, %s) before I/O", async (id, limit) => {
    await expect(
      getMatchedSeekersForListing(TOKEN, USER, id, limit),
    ).resolves.toEqual({ ok: false, error: "invalid_request" });
    expect(mocks.authedClient).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("returns listing_unavailable without an owned eligible listing", async () => {
    const host = filterChain({ data: { id: HOST_ID }, error: null });
    const listing = filterChain({ data: null, error: null });
    mocks.from.mockImplementation((table: string) =>
      table === "host_profiles" ? host : listing,
    );

    await expect(
      getMatchedSeekersForListing(TOKEN, USER, LISTING_ID, 12),
    ).resolves.toEqual({ ok: false, error: "listing_unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses authenticated reads only for host/listing proof and decodes the service RPC", async () => {
    const { listing } = eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({ data: [sourcedRow()], error: null });

    const result = await getMatchedSeekersForListing(
      TOKEN,
      USER,
      LISTING_ID,
      12,
    );

    expect(result).toEqual({
      ok: true,
      listingId: LISTING_ID,
      seekers: [
        {
          seekerProfileId: SEEKER_ID,
          displayName: "Anna Trail",
          shortBio: "Orchard lead",
          photoUrl: null,
          generalSkills: ["harvest", "crew lead"],
          desiredCategories: ["farm"],
          score: 82,
          band: "strong",
          alreadyInvited: false,
        },
      ],
    });
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      "host_profiles",
      "listings",
    ]);
    expect(listing.eq).toHaveBeenCalledWith("id", LISTING_ID);
    expect(listing.eq).toHaveBeenCalledWith("host_profile_id", HOST_ID);
    expect(listing.eq).toHaveBeenCalledWith("status", "live");
    expect(listing.eq).toHaveBeenCalledWith("provenance", "verified");
    expect(listing.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    expect(mocks.rpc).toHaveBeenCalledWith("get_host_sourceable_matches", {
      p_host_profile_id: HOST_ID,
      p_listing_id: LISTING_ID,
      p_limit: 12,
    });
  });

  it("uses the canonical score decoder instead of trusting a stored band cast", async () => {
    eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({
      data: [sourcedRow({ band: "invented" })],
      error: null,
    });

    const result = await getMatchedSeekersForListing(TOKEN, USER, LISTING_ID);

    expect(result).toMatchObject({
      ok: true,
      seekers: [{ band: "strong" }],
    });
    expect(JSON.stringify(result)).not.toContain("components");
    expect(JSON.stringify(result)).not.toContain("confidence");
  });

  it("never carries an arbitrary profile-photo URL into the host projection", async () => {
    eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({
      data: [
        sourcedRow({
          profile_photo_url: "https://tracker.example/host-view.gif",
        }),
      ],
      error: null,
    });

    const result = await getMatchedSeekersForListing(TOKEN, USER, LISTING_ID);

    expect(result).toMatchObject({ ok: true, seekers: [{ photoUrl: null }] });
    expect(JSON.stringify(result)).not.toContain("tracker.example");
  });

  it("preserves successful empty results", async () => {
    eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await expect(
      getMatchedSeekersForListing(TOKEN, USER, LISTING_ID),
    ).resolves.toEqual({ ok: true, listingId: LISTING_ID, seekers: [] });
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
      getMatchedSeekersForListing(TOKEN, USER, LISTING_ID),
    ).resolves.toEqual({ ok: false, error: expected });
  });

  it.each([
    sourcedRow({ seeker_profile_id: "bad-id" }),
    sourcedRow({ general_skill_tags: ["valid", 7] }),
    sourcedRow({ score: Number.NaN }),
    sourcedRow({ already_invited: "false" }),
  ])("fails closed on a malformed RPC row", async (row) => {
    eligibleAuthedReads();
    mocks.rpc.mockResolvedValue({ data: [row], error: null });

    await expect(
      getMatchedSeekersForListing(TOKEN, USER, LISTING_ID),
    ).resolves.toEqual({ ok: false, error: "temporarily_unavailable" });
  });

  it("does not collapse an authenticated host read failure to an empty shortlist", async () => {
    mocks.from.mockReturnValue(
      filterChain({ data: null, error: { code: "42501", message: "denied" } }),
    );

    await expect(
      getMatchedSeekersForListing(TOKEN, USER, LISTING_ID),
    ).resolves.toEqual({ ok: false, error: "temporarily_unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
