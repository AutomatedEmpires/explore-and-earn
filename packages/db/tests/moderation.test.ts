/**
 * Unit tests for takeModerationAction — the moderation write sequence
 * (audit insert -> report resolution -> listing mutation). The audit row is
 * the source of truth; any later write failing must surface as not-ok so the
 * moderator retries, never silently diverging the trail from real state.
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
vi.mock("../src/adminClient", () => ({
  adminClient: () => ({ from: mockFrom }),
}));

import { takeModerationAction } from "../src/queries/moderation.js";

/** Per-table ledger client: records every write payload in call order. */
function ledgerClient(results: {
  insertError?: { message: string } | null;
  reportError?: { message: string } | null;
  listingError?: { message: string } | null;
  listingRows?: unknown[] | null;
}) {
  const calls: Array<{ table: string; op: string; payload: unknown }> = [];

  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    let terminal: () => Promise<unknown> = () =>
      Promise.resolve({ data: null, error: null });

    chain.insert = (payload: unknown) => {
      calls.push({ table, op: "insert", payload });
      terminal = () =>
        Promise.resolve({ data: null, error: results.insertError ?? null });
      return chain;
    };
    chain.update = (payload: unknown) => {
      calls.push({ table, op: "update", payload });
      terminal = () =>
        Promise.resolve(
          table === "reports"
            ? { data: null, error: results.reportError ?? null }
            : {
                data: results.listingRows ?? [{ id: "l1" }],
                error: results.listingError ?? null,
              },
        );
      return chain;
    };
    chain.eq = self;
    chain.select = self;
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
      terminal().then(resolve);
    return chain;
  });

  return calls;
}

const BASE = {
  reportId: "report-1",
  subjectType: "listing" as const,
  subjectId: "l1",
  moderatorClerkUserId: "user_mod",
  rationale: "  spam farm  ",
};

beforeEach(() => {
  mockFrom.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("takeModerationAction", () => {
  it("suspended: audit insert -> report action_taken (stamped) -> listing archived, in order", async () => {
    const calls = ledgerClient({});

    const result = await takeModerationAction("srv", { ...BASE, action: "suspended" });

    expect(result).toEqual({ ok: true });
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual([
      "moderation_actions:insert",
      "reports:update",
      "listings:update",
    ]);
    expect(calls[0].payload).toMatchObject({
      report_id: "report-1",
      subject_type: "listing",
      subject_id: "l1",
      action: "suspended",
      moderator_clerk_user_id: "user_mod",
      rationale: "spam farm", // trimmed
    });
    expect(calls[1].payload).toMatchObject({
      status: "action_taken",
      resolved_at: "2026-07-06T12:00:00.000Z",
      resolved_by_clerk_user_id: "user_mod",
    });
    expect(calls[2].payload).toMatchObject({
      status: "archived",
      archived_at: "2026-07-06T12:00:00.000Z",
    });
  });

  it("reinstated: report re-opens (under_review, stamps cleared) and the listing goes live", async () => {
    const calls = ledgerClient({});

    const result = await takeModerationAction("srv", { ...BASE, action: "reinstated" });

    expect(result).toEqual({ ok: true });
    expect(calls[1].payload).toMatchObject({
      status: "under_review",
      resolved_at: null,
      resolved_by_clerk_user_id: null,
    });
    expect(calls[2].payload).toMatchObject({ status: "live", archived_at: null });
  });

  it("dismissed: report is terminal-stamped and the listing is NOT touched", async () => {
    const calls = ledgerClient({});

    const result = await takeModerationAction("srv", { ...BASE, action: "dismissed" });

    expect(result).toEqual({ ok: true });
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual([
      "moderation_actions:insert",
      "reports:update",
    ]);
    expect(calls[1].payload).toMatchObject({ status: "dismissed" });
  });

  it("warned: report resolves action_taken but no listing mutation happens", async () => {
    const calls = ledgerClient({});

    const result = await takeModerationAction("srv", { ...BASE, action: "warned" });

    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.table === "listings")).toBe(false);
  });

  it("without a reportId (direct action) it skips the report update entirely", async () => {
    const calls = ledgerClient({});

    const result = await takeModerationAction("srv", {
      ...BASE,
      reportId: null,
      action: "suspended",
    });

    expect(result).toEqual({ ok: true });
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual([
      "moderation_actions:insert",
      "listings:update",
    ]);
  });

  it("stops the sequence when the audit insert fails — nothing else is written", async () => {
    const calls = ledgerClient({ insertError: { message: "audit down" } });

    const result = await takeModerationAction("srv", { ...BASE, action: "suspended" });

    expect(result).toEqual({ ok: false, error: "audit down" });
    expect(calls).toHaveLength(1);
  });

  it("surfaces a listing-update failure as not-ok so the moderator can retry", async () => {
    const calls = ledgerClient({ listingError: { message: "listing write failed" } });

    const result = await takeModerationAction("srv", { ...BASE, action: "suspended" });

    expect(result).toEqual({ ok: false, error: "listing write failed" });
    expect(calls).toHaveLength(3); // audit + report happened; caller sees the failure
  });

  it("returns 'Listing not found.' when the mutation matches no row", async () => {
    ledgerClient({ listingRows: [] });

    const result = await takeModerationAction("srv", { ...BASE, action: "suspended" });

    expect(result).toEqual({ ok: false, error: "Listing not found." });
  });

  it("rejects a missing moderator id before writing anything", async () => {
    const calls = ledgerClient({});

    const result = await takeModerationAction("srv", {
      ...BASE,
      moderatorClerkUserId: "",
      action: "suspended",
    });

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
