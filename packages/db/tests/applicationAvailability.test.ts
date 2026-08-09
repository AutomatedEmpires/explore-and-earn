import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("../src/client.js", () => ({
  authedClient: () => ({ from: mockFrom, rpc: mockRpc }),
  anonClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

const mockGetSeekerResume = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../src/queries/seekerResume.js", () => ({
  getSeekerResume: mockGetSeekerResume,
}));
vi.mock("../src/lib/resumeCompleteness.js", () => ({
  isSeekerResumeComplete: () => true,
}));

import { applyToListing } from "../src/queries/applications.js";

type QueryResult = { data?: unknown; error?: unknown };

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  const terminal = () => Promise.resolve({ data: null, error: null, ...result });
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.update = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.maybeSingle = terminal;
  chain.single = vi.fn(terminal);
  (chain as { then?: unknown }).then = (resolve: (value: unknown) => void) =>
    terminal().then(resolve);
  return chain;
}

const SEEKER_PROFILE = { data: { id: "seeker-1" }, error: null };
const FUTURE_EXPIRY = "2099-01-01T00:00:00.000Z";

function acceptingListing(expiresAt: string | null = FUTURE_EXPIRY) {
  return {
    status: "live",
    expires_at: expiresAt,
    provenance: "verified",
    host_profile_id: "host-1",
    host_profiles: { clerk_user_id: "host_user" },
  };
}

function queuePrecheck(listingResult: QueryResult) {
  mockFrom
    .mockReturnValueOnce(makeChain(SEEKER_PROFILE))
    .mockReturnValueOnce(makeChain(listingResult));
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockGetSeekerResume.mockClear();
});

describe("applyToListing listing availability", () => {
  it.each([
    ["BMP", "a"],
    ["surrogate-pair", "😀"],
  ])("allows exactly 2,000 %s code points", async (_case, codePoint) => {
    queuePrecheck({ data: acceptingListing(), error: null });
    mockRpc.mockReturnValue(
      makeChain({
        data: {
          application_id: "application-1",
          seeker_profile_id: "seeker-1",
          listing_id: "listing-1",
          disposition: "created",
        },
        error: null,
      }),
    );
    const coverMessage = codePoint.repeat(2000);

    const result = await applyToListing(
      "token",
      "seeker_user",
      "listing-1",
      coverMessage,
    );

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("submit_my_application", {
      p_listing_id: "listing-1",
      p_cover_message: coverMessage,
      p_origin_invite_id: null,
    });
  });

  it.each([
    ["BMP", "a"],
    ["surrogate-pair", "😀"],
  ])(
    "rejects 2,001 %s code points before any I/O",
    async (_case, codePoint) => {
      const result = await applyToListing(
        "token",
        "seeker_user",
        "listing-1",
        codePoint.repeat(2001),
      );

      expect(result).toEqual({ ok: false, error: "cover_message_too_long" });
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockGetSeekerResume).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing", null],
    ["not live", { ...acceptingListing(), status: "paused" }],
    ["expired", { ...acceptingListing(), expires_at: "2020-01-01T00:00:00.000Z" }],
    ["missing expiry", { ...acceptingListing(), expires_at: null }],
    ["invalid expiry", { ...acceptingListing(), expires_at: "not-a-date" }],
    ["sourced", { ...acceptingListing(), provenance: "sourced" }],
    ["hostless", { ...acceptingListing(), host_profile_id: null, host_profiles: null }],
    [
      "blank-owned",
      { ...acceptingListing(), host_profiles: { clerk_user_id: "   " } },
    ],
  ])("rejects a %s listing before résumé hydration or submission", async (_case, row) => {
    queuePrecheck({ data: row, error: null });

    const result = await applyToListing("token", "seeker_user", "listing-1");

    expect(result).toEqual({
      ok: false,
      error: "listing_not_accepting_applications",
    });
    expect(mockGetSeekerResume).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("submits an eligible future listing through the authoritative RPC", async () => {
    queuePrecheck({ data: acceptingListing(), error: null });
    const rpcChain = makeChain({
      data: {
        application_id: "application-1",
        seeker_profile_id: "seeker-1",
        listing_id: "listing-1",
        disposition: "created",
      },
      error: null,
    });
    mockRpc.mockReturnValue(rpcChain);

    const result = await applyToListing(
      "token",
      "seeker_user",
      "listing-1",
      "Ready to help",
    );

    expect(result).toEqual({
      ok: true,
      applicationId: "application-1",
      seekerProfileId: "seeker-1",
      disposition: "created",
    });
    expect(mockGetSeekerResume).toHaveBeenCalledOnce();
    expect(mockRpc).toHaveBeenCalledWith("submit_my_application", {
      p_listing_id: "listing-1",
      p_cover_message: "Ready to help",
      p_origin_invite_id: null,
    });
    expect(rpcChain.single).toHaveBeenCalledOnce();
  });

  it("blocks self-application before résumé hydration", async () => {
    queuePrecheck({
      data: {
        ...acceptingListing(),
        host_profiles: { clerk_user_id: "seeker_user" },
      },
      error: null,
    });

    const result = await applyToListing("token", "seeker_user", "listing-1");

    expect(result).toEqual({
      ok: false,
      error: "cannot_apply_to_own_listing",
    });
    expect(mockGetSeekerResume).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("conceals raw listing-read failures", async () => {
    queuePrecheck({
      data: null,
      error: { message: "relation listings_internal does not exist" },
    });

    const result = await applyToListing("token", "seeker_user", "listing-1");

    expect(result).toEqual({ ok: false, error: "temporarily_unavailable" });
    expect(JSON.stringify(result)).not.toContain("listings_internal");
  });

  it("uses the legacy create bridge only for this RPC's PGRST202 signature", async () => {
    queuePrecheck({ data: acceptingListing(), error: null });
    mockRpc.mockReturnValueOnce(
      makeChain({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.submit_my_application in the schema cache",
        },
      }),
    );
    const existing = makeChain({ data: null, error: null });
    const inserted = makeChain({ data: { id: "application-legacy" }, error: null });
    mockFrom.mockReturnValueOnce(existing).mockReturnValueOnce(inserted);

    const result = await applyToListing(
      "token",
      "seeker_user",
      "listing-1",
      "Ready to help",
    );

    expect(result).toEqual({
      ok: true,
      legacySubmission: true,
      disposition: "created",
      applicationId: "application-legacy",
      seekerProfileId: "seeker-1",
    });
    expect(inserted.insert).toHaveBeenCalledWith({
      listing_id: "listing-1",
      seeker_profile_id: "seeker-1",
      cover_message: "Ready to help",
    });
    expect(mockFrom).toHaveBeenCalledTimes(4);
  });

  it("recovers the winning application id after a legacy insert race", async () => {
    queuePrecheck({ data: acceptingListing(), error: null });
    mockRpc.mockReturnValueOnce(
      makeChain({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.submit_my_application in the schema cache",
        },
      }),
    );
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(
        makeChain({ data: null, error: { code: "23505" } }),
      )
      .mockReturnValueOnce(
        makeChain({
          data: { id: "application-winner", status: "applied" },
          error: null,
        }),
      );

    const result = await applyToListing(
      "token",
      "seeker_user",
      "listing-1",
    );

    expect(result).toEqual({
      ok: false,
      error: "already_applied",
      legacySubmission: true,
      applicationId: "application-winner",
      seekerProfileId: "seeker-1",
    });
    expect(mockFrom).toHaveBeenCalledTimes(5);
  });

  it("fails closed when a legacy insert-race winner cannot be recovered", async () => {
    queuePrecheck({ data: acceptingListing(), error: null });
    mockRpc.mockReturnValueOnce(
      makeChain({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.submit_my_application in the schema cache",
        },
      }),
    );
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(
        makeChain({ data: null, error: { code: "23505" } }),
      )
      .mockReturnValueOnce(
        makeChain({
          data: null,
          error: { message: "private recovery read detail" },
        }),
      );

    const result = await applyToListing(
      "token",
      "seeker_user",
      "listing-1",
    );

    expect(result).toEqual({
      ok: false,
      error: "temporarily_unavailable",
      legacySubmission: true,
    });
    expect(JSON.stringify(result)).not.toContain("private recovery read detail");
  });

  it.each([
    [
      "same code for another function",
      {
        code: "PGRST202",
        message: "Could not find the function public.some_other_function",
      },
      "temporarily_unavailable",
    ],
    [
      "permission error",
      { code: "42501", message: "permission denied for function" },
      "temporarily_unavailable",
    ],
    [
      "business refusal",
      { code: "23514", message: "listing_not_accepting_applications" },
      "listing_not_accepting_applications",
    ],
    [
      "unknown database failure",
      { code: "XX000", message: "private database detail" },
      "temporarily_unavailable",
    ],
  ])("never falls back for a %s", async (_case, rpcError, expected) => {
    queuePrecheck({ data: acceptingListing(), error: null });
    mockRpc.mockReturnValueOnce(makeChain({ data: null, error: rpcError }));

    const result = await applyToListing("token", "seeker_user", "listing-1");

    expect(result).toEqual({ ok: false, error: expected });
    expect(result.legacySubmission).toBeUndefined();
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("preserves whitelisted RPC errors and conceals unknown database text", async () => {
    for (const [message, expected] of [
      ["listing_not_accepting_applications", "listing_not_accepting_applications"],
      ["application_conflict", "conflict"],
      ["violates private trigger internal_detail", "temporarily_unavailable"],
    ] as const) {
      mockFrom.mockReset();
      queuePrecheck({ data: acceptingListing(), error: null });
      mockRpc.mockReturnValueOnce(
        makeChain({ data: null, error: { message } }),
      );

      const result = await applyToListing("token", "seeker_user", "listing-1");

      expect(result).toEqual({ ok: false, error: expected });
      expect(JSON.stringify(result)).not.toContain("internal_detail");
    }
  });
});
