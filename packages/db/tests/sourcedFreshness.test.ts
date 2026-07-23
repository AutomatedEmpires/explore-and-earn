import { describe, expect, it, vi } from "vitest";

import { LISTING_SOURCE_STATUSES, SOURCED_STALE_DAYS } from "@explore-and-earn/contracts";

/**
 * The freshness sweep's DB contract. The original bug (found in the 2026-07-23
 * activation review, fixed by migration 078): the sweep stamped
 * source_status='stale' while 064's CHECK didn't allow the value — every
 * sweep UPDATE failed with a check violation the expiry cron swallows, so
 * stale sourced listings would have stayed live forever, silently. These
 * tests pin the written payload against the canonical contracts list and the
 * safety predicates, so a future enum/payload drift fails HERE instead of
 * silently in production.
 */

const captured: {
  update?: Record<string, unknown>;
  filters: Array<{ op: string; args: unknown[] }>;
} = { filters: [] };

vi.mock("server-only", () => ({}));
vi.mock("../src/adminClient", () => ({
  adminClient: () => ({
    from: (table: string) => {
      captured.filters.push({ op: "from", args: [table] });
      const chain = {
        update(payload: Record<string, unknown>) {
          captured.update = payload;
          return chain;
        },
        eq(...args: unknown[]) {
          captured.filters.push({ op: "eq", args });
          return chain;
        },
        neq(...args: unknown[]) {
          captured.filters.push({ op: "neq", args });
          return chain;
        },
        lt(...args: unknown[]) {
          captured.filters.push({ op: "lt", args });
          return chain;
        },
        select() {
          return Promise.resolve({ data: [{ id: "a" }, { id: "b" }], error: null });
        },
      };
      return chain;
    },
  }),
}));

import { sweepStaleSourcedListings } from "../src/queries/sourcedFreshness";

describe("sweepStaleSourcedListings DB contract", () => {
  it("writes ONLY legal source_status values and closes, never deletes", async () => {
    const nowMs = Date.parse("2026-07-23T00:00:00Z");
    const result = await sweepStaleSourcedListings(undefined, nowMs);

    expect(result.ok).toBe(true);
    expect(result.closed).toBe(2);

    expect(captured.update).toBeDefined();
    // The regression: a value outside the CHECK list fails every sweep, and
    // the cron swallows it — pin against the canonical contracts list.
    expect(LISTING_SOURCE_STATUSES).toContain(captured.update!.source_status);
    expect(captured.update!.source_status).toBe("stale");
    expect(captured.update!.status).toBe("closed");
    expect(captured.update!.closed_at).toBe(new Date(nowMs).toISOString());
  });

  it("targets only live sourced rows, skips in-flight claims, uses the stale cutoff", async () => {
    captured.filters.length = 0;
    const nowMs = Date.parse("2026-07-23T00:00:00Z");
    await sweepStaleSourcedListings(undefined, nowMs);

    const byOp = (op: string) => captured.filters.filter((f) => f.op === op);
    expect(byOp("from")[0]!.args).toEqual(["listings"]);
    expect(byOp("eq").map((f) => f.args)).toEqual(
      expect.arrayContaining([
        ["provenance", "sourced"],
        ["status", "live"],
        // Terminal source states (withdrawn/removed) are never overwritten —
        // only active rows can go stale (review 2026-07-23).
        ["source_status", "active"],
      ]),
    );
    expect(byOp("neq").map((f) => f.args)).toEqual([["claim_summary", "claim_pending"]]);
    const lt = byOp("lt")[0]!;
    expect(lt.args[0]).toBe("source_last_seen_at");
    expect(lt.args[1]).toBe(
      new Date(nowMs - SOURCED_STALE_DAYS * 86_400_000).toISOString(),
    );
  });
});
