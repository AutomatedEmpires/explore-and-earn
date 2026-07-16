/**
 * Lifecycle expiry sweep invariants:
 *
 *  - Three buckets sweep independently: 30d pipeline applications, 7d offers,
 *    14d pending invites — each transitions ONLY its own status set.
 *  - NULL-expiry rows are never touched (pre-067 safety: running the cron
 *    before the schema half is applied must be a no-op, not a guess).
 *  - Counts come from RETURNING ids, so the cron response is exact.
 *  - Any bucket failure fails the sweep loudly (ok:false + error) with zeroed
 *    counts — never a partial success reported as clean.
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
vi.mock("../src/adminClient.js", () => ({
  adminClient: () => ({ from: mockFrom }),
}));

import { sweepExpiredLifecycles } from "../src/queries/lifecycleExpiry.js";

type Call = { method: string; args: unknown[] };

/** Recording chain: every builder call is captured; terminal resolves rows. */
function makeChain(rows: unknown[], error: unknown = null) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const method of ["update", "in", "not", "lt", "select"]) {
    chain[method] = record(method);
  }
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: rows, error }).then(resolve);
  return { chain, calls };
}

beforeEach(() => {
  mockFrom.mockReset();
});

const NOW = "2026-07-16T12:00:00.000Z";

describe("sweepExpiredLifecycles", () => {
  it("sweeps the three buckets with exact counts and the null-expiry guard", async () => {
    const buckets = [
      makeChain([{ id: "a1" }, { id: "a2" }]), // pipeline applications
      makeChain([{ id: "o1" }]), // offers
      makeChain([]), // invites
    ];
    let call = 0;
    mockFrom.mockImplementation(() => buckets[call++].chain);

    const result = await sweepExpiredLifecycles(NOW);

    expect(result).toEqual({
      ok: true,
      applicationsExpired: 2,
      offersExpired: 1,
      invitesExpired: 0,
    });

    // Bucket 1: pipeline statuses only, never offered/terminal states.
    expect(buckets[0].calls.find((c) => c.method === "in")?.args).toEqual([
      "status",
      ["applied", "reviewing", "saved_by_host"],
    ]);
    // Bucket 2: offers alone (their window is 7d, not 30d).
    expect(buckets[1].calls.find((c) => c.method === "in")?.args).toEqual([
      "status",
      ["offered"],
    ]);
    // Bucket 3: pending invites only.
    expect(buckets[2].calls.find((c) => c.method === "in")?.args).toEqual([
      "status",
      ["created", "delivered", "viewed"],
    ]);

    for (const bucket of buckets) {
      // NULL expires_at is excluded in every bucket (pre-067 no-op safety)…
      expect(bucket.calls.find((c) => c.method === "not")?.args).toEqual([
        "expires_at",
        "is",
        null,
      ]);
      // …the cutoff is the sweep instant…
      expect(bucket.calls.find((c) => c.method === "lt")?.args).toEqual([
        "expires_at",
        NOW,
      ]);
      // …and every bucket transitions to 'expired' with RETURNING ids.
      expect(bucket.calls.find((c) => c.method === "update")?.args).toEqual([
        { status: "expired" },
      ]);
      expect(bucket.calls.find((c) => c.method === "select")?.args).toEqual(["id"]);
    }
  });

  it("fails loudly (ok:false, zero counts) when a bucket errors", async () => {
    const first = makeChain([{ id: "a1" }]);
    const failing = makeChain([], { message: "boom" });
    let call = 0;
    mockFrom.mockImplementation(() => (call++ === 0 ? first.chain : failing.chain));

    const result = await sweepExpiredLifecycles(NOW);

    expect(result.ok).toBe(false);
    expect(result.applicationsExpired).toBe(0);
    expect(result.offersExpired).toBe(0);
    expect(result.invitesExpired).toBe(0);
    expect(result.error).toContain("boom");
  });
});
