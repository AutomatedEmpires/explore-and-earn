/**
 * Unit tests for the analytics event recorder (packages/db/src/queries/events.ts)
 * and the sourcing rollup reads (packages/db/src/queries/sourcingRollups.ts).
 *
 * `events` is append-only and RLS deny-by-default, so every write here goes
 * through the service-role admin client — mocked below so no DB connection is
 * required. The rollups are dashboard reads over tables that may not exist
 * yet (pre-064 DB) or may simply error; the contract under test is that they
 * NEVER throw and degrade to zeros/empty instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
const mockAdminClient = vi.fn(() => ({ from: mockFrom }));
vi.mock("../src/adminClient", () => ({
  adminClient: () => mockAdminClient(),
}));

import { recordEvent, recordEvents, type RecordEventInput } from "../src/queries/events";
import {
  getSourcingFunnelRollup,
  getSourcedInventoryRollup,
} from "../src/queries/sourcingRollups";

type ChainResult = { data?: unknown; error?: unknown; count?: number | null };

/**
 * A minimal stand-in for a Supabase PostgrestFilterBuilder: every builder
 * method returns the same chain (so any call sequence is supported), and the
 * chain itself is thenable, resolving to `result` — mirroring how the real
 * client resolves regardless of how many filters were chained on top.
 */
function makeChain(result: ChainResult = {}) {
  const response = { data: null, error: null, count: null, ...result };
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (
      onFulfilled: (value: typeof response) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(response).then(onFulfilled, onRejected),
  };
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockAdminClient.mockReset();
  mockAdminClient.mockImplementation(() => ({ from: mockFrom }));
});

describe("recordEvent", () => {
  it("inserts the right row shape: event_type mapping + properties default {}", async () => {
    const chain = makeChain({ error: null });
    mockFrom.mockReturnValueOnce(chain);

    const ok = await recordEvent({
      eventType: "sourced_listing_viewed",
      actorScope: "seeker",
      listingId: "listing-1",
    });

    expect(ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("events");
    const row = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row).toEqual({
      event_type: "sourced_listing_viewed",
      actor_scope: "seeker",
      subject_type: null,
      subject_id: null,
      listing_id: "listing-1",
      host_profile_id: null,
      seeker_profile_id: null,
      source_surface: null,
      properties: {},
    });
    // Clerk ids are not uuids — never write actor_user_id.
    expect(row).not.toHaveProperty("actor_user_id");
  });

  it("carries supplied properties through untouched", async () => {
    const chain = makeChain({ error: null });
    mockFrom.mockReturnValueOnce(chain);

    await recordEvent({
      eventType: "listing_claim_converted",
      properties: { source: "csv_import", attempt: 2, retried: false },
    });

    const row = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.properties).toEqual({ source: "csv_import", attempt: 2, retried: false });
  });

  it("returns false on an insert error, never throws", async () => {
    mockFrom.mockReturnValueOnce(makeChain({ error: { message: "insert failed" } }));

    await expect(recordEvent({ eventType: "sourced_listing_viewed" })).resolves.toBe(false);
  });

  it("returns false without throwing when adminClient itself fails (e.g. missing env)", async () => {
    mockAdminClient.mockImplementationOnce(() => {
      throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
    });

    await expect(recordEvent({ eventType: "sourced_listing_viewed" })).resolves.toBe(false);
  });
});

describe("recordEvents", () => {
  it("batches every input into a single insert call", async () => {
    const chain = makeChain({ error: null });
    mockFrom.mockReturnValueOnce(chain);

    const inputs: RecordEventInput[] = [
      { eventType: "sourced_listing_viewed" },
      { eventType: "sourced_listing_matched" },
      { eventType: "listing_claim_initiated" },
    ];
    const count = await recordEvents(inputs);

    expect(count).toBe(3);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    const rows = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as unknown[];
    expect(rows).toHaveLength(3);
  });

  it("returns 0 for an empty batch without any I/O", async () => {
    const count = await recordEvents([]);

    expect(count).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 0 on an insert error, never throws", async () => {
    mockFrom.mockReturnValueOnce(makeChain({ error: { message: "boom" } }));

    await expect(
      recordEvents([{ eventType: "sourced_listing_viewed" }]),
    ).resolves.toBe(0);
  });
});

describe("getSourcingFunnelRollup", () => {
  it("counts events by type within the window", async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        data: [
          { event_type: "sourced_listing_viewed" },
          { event_type: "sourced_listing_viewed" },
          { event_type: "sourced_listing_matched" },
          { event_type: "sourced_listing_source_clicked" },
          { event_type: "listing_claim_initiated" },
          { event_type: "listing_claim_converted" },
          { event_type: "listing_claim_converted" },
        ],
      }),
    );

    const rollup = await getSourcingFunnelRollup(30);

    expect(rollup).toEqual({
      windowDays: 30,
      sourcedViewed: 2,
      sourcedMatched: 1,
      sourceClicks: 1,
      claimsInitiated: 1,
      claimsApproved: 0,
      claimsRejected: 0,
      claimsConverted: 2,
    });
  });

  it("degrades to zeros when the query errors", async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({ error: { message: "relation \"events\" does not exist" } }),
    );

    const rollup = await getSourcingFunnelRollup(14);

    expect(rollup).toEqual({
      windowDays: 14,
      sourcedViewed: 0,
      sourcedMatched: 0,
      sourceClicks: 0,
      claimsInitiated: 0,
      claimsApproved: 0,
      claimsRejected: 0,
      claimsConverted: 0,
    });
  });

  it("degrades to zeros (default 30-day window) without throwing when adminClient fails", async () => {
    mockAdminClient.mockImplementationOnce(() => {
      throw new Error("Missing required environment variable");
    });

    await expect(getSourcingFunnelRollup()).resolves.toEqual({
      windowDays: 30,
      sourcedViewed: 0,
      sourcedMatched: 0,
      sourceClicks: 0,
      claimsInitiated: 0,
      claimsApproved: 0,
      claimsRejected: 0,
      claimsConverted: 0,
    });
  });
});

describe("getSourcedInventoryRollup", () => {
  it("zeros on error", async () => {
    mockFrom.mockReturnValue(
      makeChain({ error: { message: "relation \"listings\" does not exist" } }),
    );

    const rollup = await getSourcedInventoryRollup(Date.parse("2026-07-14T00:00:00Z"));

    expect(rollup).toEqual({
      liveSourced: 0,
      liveVerified: 0,
      convertedTotal: 0,
      staleSourced: 0,
    });
  });

  it("reports the four independent counts", async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ count: 5 })) // liveSourced
      .mockReturnValueOnce(makeChain({ count: 12 })) // liveVerified
      .mockReturnValueOnce(makeChain({ count: 3 })) // convertedTotal
      .mockReturnValueOnce(makeChain({ count: 2 })); // staleSourced

    const rollup = await getSourcedInventoryRollup(Date.parse("2026-07-14T00:00:00Z"));

    expect(rollup).toEqual({
      liveSourced: 5,
      liveVerified: 12,
      convertedTotal: 3,
      staleSourced: 2,
    });
  });

  it("zeros without throwing when adminClient fails", async () => {
    mockAdminClient.mockImplementationOnce(() => {
      throw new Error("Missing required environment variable");
    });

    await expect(getSourcedInventoryRollup()).resolves.toEqual({
      liveSourced: 0,
      liveVerified: 0,
      convertedTotal: 0,
      staleSourced: 0,
    });
  });
});
