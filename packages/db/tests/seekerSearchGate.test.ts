/**
 * Regression tests for the seeker-search enumeration gate
 * (packages/db/src/queries/invites.ts — searchSeekersForInvite).
 *
 * What these pin:
 *  - HOST GATE: a caller with NO host profile gets an empty result and the
 *    seeker_profiles table is NEVER queried — searching seeker names/bios is a
 *    host-only capability, not something any authenticated user can script.
 *  - RESULT CAP: even when the underlying queries return more rows, the merged
 *    result is deduped and hard-capped at 20 — no bulk PII export per call.
 *  - QUERY SANITIZATION: PostgREST pattern metacharacters are stripped before
 *    the ilike pattern is built, and an effectively-empty query short-circuits
 *    to [] without touching the database at all.
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock server-only so the import doesn't crash in the test environment ───
vi.mock("server-only", () => ({}));

// ── Stub authedClient before importing the module under test ───────────────
const mockFrom = vi.fn();
const mockClient = { from: mockFrom };
vi.mock("../src/client.js", () => ({
  authedClient: () => mockClient,
}));

import { searchSeekersForInvite } from "../src/queries/invites.js";

const TOKEN = "tok";
const USER = "user-1";

/** Fluent chain stub ending in .maybeSingle() (host_profiles lookup). */
function maybeSingleChain(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(result),
      }),
    }),
  };
}

/** Fluent chain stub ending in .limit() (seeker_profiles ilike search). */
function ilikeChain(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      ilike: () => ({
        limit: () => Promise.resolve(result),
      }),
    }),
  };
}

function seekerRow(n: number) {
  return { id: `seeker-${n}`, display_name: `Seeker ${n}`, short_bio: `Bio ${n}` };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchSeekersForInvite — host gate", () => {
  it("returns [] for a caller with no host profile and never queries seeker_profiles", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "host_profiles") {
        return maybeSingleChain({ data: null, error: null });
      }
      throw new Error(`unexpected table query: ${table}`);
    });

    const result = await searchSeekersForInvite(TOKEN, USER, "anna");

    expect(result).toEqual([]);
    const tables = mockFrom.mock.calls.map(([table]) => table);
    expect(tables).toContain("host_profiles");
    expect(tables).not.toContain("seeker_profiles");
  });

  it("returns results for a real host (gate passes)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "host_profiles") {
        return maybeSingleChain({ data: { id: "host-1" }, error: null });
      }
      if (table === "seeker_profiles") {
        return ilikeChain({ data: [seekerRow(1)], error: null });
      }
      throw new Error(`unexpected table query: ${table}`);
    });

    const result = await searchSeekersForInvite(TOKEN, USER, "anna");

    expect(result).toEqual([
      { seekerProfileId: "seeker-1", displayName: "Seeker 1", bio: "Bio 1" },
    ]);
  });
});

describe("searchSeekersForInvite — result cap", () => {
  it("dedupes across the name/bio queries and hard-caps the merged result at 20", async () => {
    // Both branches return the SAME 20 rows plus each contributes extras —
    // 30 distinct ids total. The merged output must be 20, deduped.
    const shared = Array.from({ length: 20 }, (_, i) => seekerRow(i));
    const nameRows = [...shared, ...Array.from({ length: 5 }, (_, i) => seekerRow(100 + i))];
    const bioRows = [...shared, ...Array.from({ length: 5 }, (_, i) => seekerRow(200 + i))];
    let seekerCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "host_profiles") {
        return maybeSingleChain({ data: { id: "host-1" }, error: null });
      }
      seekerCall += 1;
      return ilikeChain({ data: seekerCall === 1 ? nameRows : bioRows, error: null });
    });

    const result = await searchSeekersForInvite(TOKEN, USER, "farm");

    expect(result).toHaveLength(20);
    const ids = result.map((r) => r.seekerProfileId);
    expect(new Set(ids).size).toBe(20);
  });
});

describe("searchSeekersForInvite — query sanitization", () => {
  it("short-circuits to [] on an effectively-empty query without any db call", async () => {
    const result = await searchSeekersForInvite(TOKEN, USER, "%,()*  %%");
    expect(result).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
