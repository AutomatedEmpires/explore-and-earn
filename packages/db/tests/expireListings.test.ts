/**
 * Unit tests for expireListings() — the lifecycle-engine helper that backs
 * `GET /api/cron/expire-listings`.
 *
 * The Supabase admin client and the `server-only` sentinel are mocked so the
 * tests run without any environment setup or real network calls.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock `server-only` so imports that include the guard compile in test context.
// ---------------------------------------------------------------------------
vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Capture mock references for the Supabase query chain and adminClient.
// ---------------------------------------------------------------------------
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockLt = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();
const mockAdminClient = vi.fn();

vi.mock("../src/adminClient", () => ({
  adminClient: mockAdminClient,
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered.
// ---------------------------------------------------------------------------
const { expireListings } = await import("../src/queries/listingLifecycle");

// ---------------------------------------------------------------------------
// Helper — wire up the Supabase fluent-builder chain for each test.
// ---------------------------------------------------------------------------
function buildChain(result: {
  data: { id: string }[] | null;
  error: { message: string } | null;
}) {
  const chain = {
    from: mockFrom,
    update: mockUpdate,
    lt: mockLt,
    eq: mockEq,
    select: mockSelect,
  };

  mockFrom.mockReturnValue(chain);
  mockUpdate.mockReturnValue(chain);
  mockLt.mockReturnValue(chain);
  mockEq.mockReturnValue(chain);
  mockSelect.mockResolvedValue(result);
  mockAdminClient.mockReturnValue(chain);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("expireListings()", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:true with the correct count and ids when listings expire", async () => {
    buildChain({ data: [{ id: "listing-1" }, { id: "listing-2" }], error: null });

    const result = await expireListings("test-service-key");

    expect(result.ok).toBe(true);
    expect(result.archived).toBe(2);
    expect(result.ids).toEqual(["listing-1", "listing-2"]);
    expect(result.error).toBeUndefined();
  });

  it("filters only live listings whose expires_at has passed (idempotency guard)", async () => {
    buildChain({ data: [], error: null });

    await expireListings("test-service-key");

    // The update payload must set status to 'archived'.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
    // Must constrain to expired rows only.
    expect(mockLt).toHaveBeenCalledWith("expires_at", expect.any(String));
    // Must constrain to live rows only — re-running has no effect on already-archived rows.
    expect(mockEq).toHaveBeenCalledWith("status", "live");
  });

  it("returns archived:0 and empty ids when no listings have expired", async () => {
    buildChain({ data: [], error: null });

    const result = await expireListings("test-service-key");

    expect(result.ok).toBe(true);
    expect(result.archived).toBe(0);
    expect(result.ids).toEqual([]);
  });

  it("returns ok:false with the DB error message on a Supabase failure", async () => {
    buildChain({ data: null, error: { message: "connection refused" } });

    const result = await expireListings("test-service-key");

    expect(result.ok).toBe(false);
    expect(result.archived).toBe(0);
    expect(result.error).toBe("connection refused");
  });

  it("sets archived_at to the ISO timestamp used in the filter (consistent clock)", async () => {
    buildChain({ data: [{ id: "x" }], error: null });

    await expireListings("test-service-key");

    const updateArg = mockUpdate.mock.calls[0][0] as Record<string, string>;
    const filterArg = mockLt.mock.calls[0][1] as string;

    // Both archived_at and the expires_at filter should use the same timestamp.
    expect(updateArg["archived_at"]).toBe(filterArg);
  });

  it("is idempotent: a second sweep with no live expired listings returns archived:0", async () => {
    // First sweep — two listings expire.
    buildChain({ data: [{ id: "a" }, { id: "b" }], error: null });
    const first = await expireListings("key");
    expect(first.archived).toBe(2);

    // Second sweep — those rows are already archived so none match status='live'.
    buildChain({ data: [], error: null });
    const second = await expireListings("key");
    expect(second.archived).toBe(0);
  });
});
