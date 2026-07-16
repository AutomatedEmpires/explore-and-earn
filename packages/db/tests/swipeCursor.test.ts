/**
 * Swipe-deck cursor completeness — pins the composite (published_at, id)
 * keyset so page boundaries can never skip rows that share the boundary
 * timestamp again:
 *  - a composite cursor produces the or() keyset group (lt OR eq+id.lt)
 *  - a legacy bare-timestamp cursor still pages via the parameterized .lt()
 *  - a malformed composite falls back to the legacy path (never interpolated)
 *  - the fetch order is (published_at DESC, id DESC) — the keyset's mirror
 *  - encodeSwipeCursor round-trips through getSwipeBatch's parser
 *
 * Uses the same recording-chain mock as searchListings.test.ts — every builder
 * call is captured as (method, args) so assertions read like the query itself.
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
  for (const m of ["select", "eq", "or", "not", "lt", "order", "limit"]) {
    chain[m] = record(m);
  }
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: [], error: null, ...result }).then(resolve);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("../src/client.js", () => ({
  anonClient: () => ({ from: mockFrom }),
  authedClient: () => ({ from: mockFrom }),
}));
vi.mock("../src/adminClient.js", () => ({
  adminClient: () => ({ from: vi.fn() }),
}));
// Server-resolved exclusions are not under test here — resolve to empty.
vi.mock("../src/queries/idReaders.js", () => ({
  getSeekerApplicationIds: vi.fn(async () => [] as string[]),
  getActiveBoostedListingIds: vi.fn(async () => new Set<string>()),
}));
vi.mock("../src/queries/passedListings.js", () => ({
  getPassedListingIds: vi.fn(async () => [] as string[]),
}));

import { encodeSwipeCursor, getSwipeBatch } from "../src/queries/listings.js";

function callsFor(method: string): Call[] {
  return calls.filter((c) => c.method === method);
}

const TS = "2026-07-01T12:00:00+00:00";
const ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  calls = [];
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => recordingBuilder({}));
});

describe("getSwipeBatch cursor keyset", () => {
  it("expands a composite cursor into the complete (published_at, id) keyset", async () => {
    await getSwipeBatch("token", "user_1", [], `${TS}|${ID}`);
    expect(callsFor("lt")).toHaveLength(0);
    expect(callsFor("or")[0]?.args[0]).toBe(
      `published_at.lt."${TS}",and(published_at.eq."${TS}",id.lt.${ID})`,
    );
  });

  it("still pages a legacy bare-timestamp cursor via parameterized .lt()", async () => {
    await getSwipeBatch("token", "user_1", [], TS);
    expect(callsFor("or")).toHaveLength(0);
    expect(callsFor("lt")[0]?.args).toEqual(["published_at", TS]);
  });

  it("never interpolates a malformed composite — falls back to the legacy path", async () => {
    const malformed = `not-a-timestamp|also-not-a-uuid`;
    await getSwipeBatch("token", "user_1", [], malformed);
    expect(callsFor("or")).toHaveLength(0);
    expect(callsFor("lt")[0]?.args).toEqual(["published_at", malformed]);
  });

  it("issues no cursor filter at all on the first page", async () => {
    await getSwipeBatch("token", "user_1", []);
    expect(callsFor("or")).toHaveLength(0);
    expect(callsFor("lt")).toHaveLength(0);
  });

  it("orders (published_at DESC, id DESC) — the keyset's mirror", async () => {
    await getSwipeBatch("token", "user_1", []);
    expect(callsFor("order").map((c) => c.args)).toEqual([
      ["published_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
  });
});

describe("encodeSwipeCursor", () => {
  it("round-trips through getSwipeBatch's parser as a composite keyset", async () => {
    const cursor = encodeSwipeCursor({ published_at: TS, id: ID });
    expect(cursor).toBe(`${TS}|${ID}`);
    await getSwipeBatch("token", "user_1", [], cursor as string);
    expect(callsFor("or")).toHaveLength(1);
  });

  it("returns null when the row has no published_at (deck exhausted)", () => {
    expect(encodeSwipeCursor({ published_at: null, id: ID })).toBeNull();
  });
});
