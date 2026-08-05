import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let lookupResult: { data: unknown; error: unknown };
let rpcResult: { data: unknown; error: unknown };
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

function lookupBuilder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve(lookupResult);
  return chain;
}

vi.mock("../src/client", () => ({
  authedClient: () => ({
    from: () => lookupBuilder(),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  }),
}));

vi.mock("../src/adminClient", () => ({
  adminClient: () => ({
    from: () => lookupBuilder(),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  }),
}));

const {
  cancelSchedulingRequest,
  getSchedulingRequestForApplication,
  proposeHostSchedulingRequest,
  respondToSchedulingRequest,
} = await import("../src/queries/scheduling");
const SCHEDULING_SOURCE = readFileSync(
  new URL("../src/queries/scheduling.ts", import.meta.url),
  "utf8",
);

beforeEach(() => {
  lookupResult = { data: null, error: null };
  rpcResult = { data: null, error: null };
  rpcCalls.length = 0;
});

describe("scheduling deployment window", () => {
  it("returns an unavailable surface while migration 088 is absent from the Data API", async () => {
    lookupResult = {
      data: null,
      error: { code: "PGRST205", message: "scheduling_requests not in schema cache" },
    };
    await expect(
      getSchedulingRequestForApplication("token", "app-1"),
    ).resolves.toEqual({ available: false, request: null });
  });

  it("maps the immutable listing-title snapshot without a live listing join", async () => {
    lookupResult = {
      data: {
        id: "request-1",
        application_id: "application-1",
        listing_title: "Durable listing title",
        status: "proposed",
        meeting_type: "video",
        duration_minutes: 30,
        proposal_timezone: "UTC",
        meeting_details: "Private link",
        current_round: 1,
        selected_option_id: null,
        expires_at: "2026-09-01T00:00:00.000Z",
        responded_at: null,
        cancelled_at: null,
        cancelled_by: null,
        completed_at: null,
        no_show_at: null,
        created_at: "2026-08-05T00:00:00.000Z",
      },
      error: null,
    };

    const result = await getSchedulingRequestForApplication(
      "token",
      "application-1",
    );
    expect(result.request?.listingTitle).toBe("Durable listing title");
    expect(SCHEDULING_SOURCE).toContain(
      '"*,applications!application_id!inner(seeker_profile_id)"',
    );
    expect(SCHEDULING_SOURCE).not.toContain("listings!listing_id(title)");
    expect(SCHEDULING_SOURCE).toContain(
      "application_id,listing_title,status,current_round,expires_at",
    );
  });

  it("maps a missing scheduling RPC to not_available instead of a raw provider error", async () => {
    rpcResult = {
      data: null,
      error: { code: "PGRST202", message: "function not in schema cache" },
    };
    const result = await proposeHostSchedulingRequest("clerk-host", {
      applicationId: "app-1",
      meetingType: "video",
      durationMinutes: 30,
      proposalTimezone: "America/Los_Angeles",
      meetingDetails: "Private link",
      startsAt: ["2026-09-01T18:00:00.000Z"],
    });
    expect(result).toEqual({ ok: false, error: "not_available" });
  });
});

describe("scheduling RPC result contracts", () => {
  it("accepts the boolean seeker-response contract", async () => {
    rpcResult = { data: true, error: null };
    await expect(
      respondToSchedulingRequest("clerk-seeker", "request-1", "selected", "option-1"),
    ).resolves.toEqual({ ok: true, requestId: "request-1" });
  });

  it("takes cancellation actor scope only from the RPC result", async () => {
    rpcResult = { data: "seeker", error: null };
    await expect(
      cancelSchedulingRequest("clerk-seeker", "request-1"),
    ).resolves.toEqual({
      ok: true,
      requestId: "request-1",
      actorScope: "seeker",
    });
    expect(rpcCalls[0]).toEqual({
      name: "cancel_my_scheduling_request",
      args: {
        p_clerk_user_id: "clerk-seeker",
        p_request_id: "request-1",
      },
    });
  });

  it("rejects unknown cancellation result values", async () => {
    rpcResult = { data: true, error: null };
    await expect(
      cancelSchedulingRequest("clerk-user", "request-1"),
    ).resolves.toEqual({ ok: false, error: "conflict" });
  });

  it("maps a transactional seeker overlap rejection to a stable UI error", async () => {
    rpcResult = {
      data: null,
      error: { code: "23P01", message: "scheduling_time_conflict" },
    };
    await expect(
      respondToSchedulingRequest(
        "clerk-seeker",
        "request-1",
        "selected",
        "option-1",
      ),
    ).resolves.toEqual({ ok: false, error: "time_conflict" });
  });
});
