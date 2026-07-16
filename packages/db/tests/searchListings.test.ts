/**
 * Unit tests for searchListings filter semantics — pins the deliberate
 * behaviors that a future filter refactor could silently break:
 *  - unknown categories are dropped against MARKETPLACE_CATEGORIES
 *  - payMin converts dollars → cents with rounding; 0/negative/NaN are ignored
 *  - payUnit gates ONLY for hour/day (other units deliberately unfiltered)
 *  - free-text and location terms are sanitized before hitting PostgREST
 *  - only live listings are ever searched
 *
 * The Supabase builder is mocked with a recording chain — every method call
 * is captured as (method, args) so assertions read like the query itself.
 * No DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { method: string; args: unknown[] };
let calls: Call[] = [];

function recordingBuilder(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const m of [
    "select",
    "eq",
    "or",
    "in",
    "not",
    "gte",
    "lte",
    "ilike",
    "order",
    "limit",
    "range",
  ]) {
    chain[m] = record(m);
  }
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: [], error: null, ...result }).then(resolve);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("../src/client.js", () => ({
  anonClient: () => ({ from: mockFrom }),
  authedClient: () => ({ from: vi.fn() }),
}));
vi.mock("../src/adminClient.js", () => ({
  adminClient: () => ({ from: vi.fn() }),
}));
// Applied ids are server-resolved through this seam when a SeekerScope is
// passed — controllable per test, defaults to "nothing applied".
const mockGetSeekerApplicationIds = vi.fn(async () => [] as string[]);
vi.mock("../src/queries/idReaders.js", () => ({
  getSeekerApplicationIds: (...args: unknown[]) =>
    mockGetSeekerApplicationIds(...(args as [])),
  getActiveBoostedListingIds: vi.fn(async () => new Set<string>()),
}));
vi.mock("../src/queries/passedListings.js", () => ({
  getPassedListingIds: vi.fn(async () => [] as string[]),
}));

import { searchListings } from "../src/queries/listings.js";

function callsFor(method: string): Call[] {
  return calls.filter((c) => c.method === method);
}

beforeEach(() => {
  calls = [];
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => recordingBuilder({}));
  mockGetSeekerApplicationIds.mockReset();
  mockGetSeekerApplicationIds.mockResolvedValue([]);
});

describe("searchListings filter semantics", () => {
  it("always scopes to live listings only", async () => {
    await searchListings({});
    expect(callsFor("eq")[0]).toEqual({ method: "eq", args: ["status", "live"] });
  });

  it("drops unknown categories and keeps locked-taxonomy ones", async () => {
    await searchListings({
      categories: ["farm", "lodge", "maritime"] as never,
    });
    const inCall = callsFor("in")[0];
    expect(inCall.args).toEqual(["category", ["farm", "maritime"]]);
  });

  it("skips the category filter entirely when every candidate is unknown", async () => {
    await searchListings({ categories: ["lodge"] as never });
    expect(callsFor("in")).toHaveLength(0);
  });

  it("converts payMin dollars to rounded cents", async () => {
    await searchListings({ payMin: 15.505 });
    expect(callsFor("gte")[0]).toEqual({
      method: "gte",
      args: ["compensation_min_cents", 1551],
    });
  });

  it.each([0, -5, Number.NaN])("ignores non-positive/NaN payMin (%s)", async (payMin) => {
    await searchListings({ payMin });
    expect(callsFor("gte")).toHaveLength(0);
  });

  it("gates payUnit only for hour and day — 'month' is deliberately unfiltered", async () => {
    await searchListings({ payUnit: "month" as never });
    const unitEqs = callsFor("eq").filter((c) => c.args[0] === "compensation_unit");
    expect(unitEqs).toHaveLength(0);

    calls = [];
    await searchListings({ payUnit: "hour" });
    expect(
      callsFor("eq").some(
        (c) => c.args[0] === "compensation_unit" && c.args[1] === "hour",
      ),
    ).toBe(true);
  });

  it("sanitizes PostgREST-reserved characters out of the free-text or() filter", async () => {
    await searchListings({ query: "farm,(hand)*%" });
    const orArg = String(callsFor("or")[0].args[0]);
    // The sanitizer replaces the reserved set , ( ) * % with spaces so the
    // or() string can't be broken/injected — the user's term arrives as
    // "farm hand". (The builder's own plfts(...)/*...* syntax remains.)
    const term = orArg.match(/plfts\(english\)\.([^,]*)/)?.[1];
    expect(term).toBe("farm hand");
    expect(orArg).toContain("title.ilike.*farm hand*");
  });

  it("applies boolean benefit filters only when requested", async () => {
    await searchListings({ hasHousing: true });
    const eqCols = callsFor("eq").map((c) => c.args[0]);
    expect(eqCols).toContain("housing_included");
    expect(eqCols).not.toContain("meals_included");
  });

  it("uses range() pagination when offset is provided, limit() otherwise", async () => {
    await searchListings({ limit: 10, offset: 20 });
    expect(callsFor("range")[0].args).toEqual([20, 29]);
    expect(callsFor("limit")).toHaveLength(0);

    calls = [];
    await searchListings({ limit: 10 });
    expect(callsFor("limit")[0].args).toEqual([10]);
    expect(callsFor("range")).toHaveLength(0);
  });

  it("orders newest-published first with an id tiebreak (stable range() pages)", async () => {
    await searchListings({});
    expect(callsFor("order").map((c) => c.args)).toEqual([
      ["published_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
  });

  it("HARD-excludes the seeker's applied listings when a scope is passed", async () => {
    const applied = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ];
    mockGetSeekerApplicationIds.mockResolvedValue(applied);
    await searchListings({}, { clerkToken: "token", clerkUserId: "user_1" });
    expect(mockGetSeekerApplicationIds).toHaveBeenCalledWith("token", "user_1");
    expect(callsFor("not")[0].args).toEqual(["id", "in", `(${applied.join(",")})`]);
  });

  it("applies no exclusion filter on the anonymous path (no scope)", async () => {
    await searchListings({});
    expect(mockGetSeekerApplicationIds).not.toHaveBeenCalled();
    expect(callsFor("not")).toHaveLength(0);
  });

  it("degrades to an unfiltered search when the applied lookup faults", async () => {
    mockGetSeekerApplicationIds.mockRejectedValue(new Error("down"));
    await searchListings({}, { clerkToken: "token", clerkUserId: "user_1" });
    expect(callsFor("not")).toHaveLength(0);
    expect(callsFor("eq")[0]).toEqual({ method: "eq", args: ["status", "live"] });
  });

  it("throws with context when the query fails", async () => {
    mockFrom.mockImplementationOnce(() =>
      recordingBuilder({ data: null, error: { message: "down" } }),
    );
    await expect(searchListings({})).rejects.toThrow(/searchListings: down/);
  });
});
