/**
 * Revoking a refunded purchase must write to a table that EXISTS.
 *
 * The defect this pins: revokeRefundedPurchaseRow updated "boost_campaigns".
 * No migration has ever created that table — 029 created
 * `listing_boost_campaigns`, and the same module reads it correctly elsewhere.
 * PostgREST answers a missing relation with 42P01, so approving a boost refund
 * returned the money and left the campaign running to its ends_at.
 *
 * Two assertions guard it: the table the code actually names, and a check that
 * the named table is one the migrations create. The second is the negative
 * control — a plausible-looking name that no migration defines fails here
 * instead of at runtime against a live database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface FromCall {
  readonly table: string;
  readonly method: string;
  readonly args: readonly unknown[];
}

const calls: FromCall[] = [];
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };

function makeBuilder(table: string): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "update", "insert", "eq", "is", "not", "in", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
  }
  const settle = () => Promise.resolve(nextResult);
  builder.maybeSingle = settle;
  builder.single = settle;
  builder.then = (onFulfilled: unknown, onRejected: unknown) =>
    settle().then(onFulfilled as never, onRejected as never);
  return builder;
}

vi.mock("../src/adminClient", () => ({
  adminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

const { revokeRefundedPurchaseRow, BOOST_CAMPAIGNS_TABLE } = await import(
  "../src/queries/refunds"
);

afterEach(() => {
  calls.length = 0;
  nextResult = { data: null, error: null };
});

function tablesTouched(): string[] {
  return [...new Set(calls.map((c) => c.table))];
}

/** Every table any migration creates, read straight off disk. */
function migrationCreatedTables(): Set<string> {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const dir = join(here, "..", "..", "..", "supabase", "migrations");
  const created = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
    )) {
      created.add(match[1].toLowerCase());
    }
  }
  return created;
}

describe("refunded-purchase revocation targets a real table", () => {
  it("revokes a boost against listing_boost_campaigns, never boost_campaigns", async () => {
    await expect(
      revokeRefundedPurchaseRow("service-key", "boost", "campaign-1"),
    ).resolves.toEqual({ ok: true });

    expect(tablesTouched()).toEqual(["listing_boost_campaigns"]);
    expect(tablesTouched()).not.toContain("boost_campaigns");

    expect(calls).toContainEqual({
      table: "listing_boost_campaigns",
      method: "update",
      args: [{ status: "refunded" }],
    });
    expect(calls).toContainEqual({
      table: "listing_boost_campaigns",
      method: "eq",
      args: ["id", "campaign-1"],
    });
  });

  it("revokes an announcement against host_announcements", async () => {
    await expect(
      revokeRefundedPurchaseRow("service-key", "announcement", "ann-1"),
    ).resolves.toEqual({ ok: true });

    expect(tablesTouched()).toEqual(["host_announcements"]);
    expect(calls).toContainEqual({
      table: "host_announcements",
      method: "update",
      args: [{ status: "removed" }],
    });
  });

  /**
   * The negative control. A table name is only correct if a migration creates
   * it — this is the check that "boost_campaigns" would have failed.
   */
  it("only names tables the migrations actually create", async () => {
    const created = migrationCreatedTables();

    // Sanity: the reader found real tables, so an empty set cannot pass this.
    expect(created.size).toBeGreaterThan(10);
    expect(created.has("boost_campaigns")).toBe(false);

    await revokeRefundedPurchaseRow("service-key", "boost", "campaign-1");
    await revokeRefundedPurchaseRow("service-key", "announcement", "ann-1");

    for (const table of tablesTouched()) {
      expect(created.has(table)).toBe(true);
    }
    expect(created.has(BOOST_CAMPAIGNS_TABLE)).toBe(true);
  });

  it("reports the database error instead of swallowing it", async () => {
    nextResult = { data: null, error: { message: 'relation "nope" does not exist' } };

    await expect(
      revokeRefundedPurchaseRow("service-key", "boost", "campaign-1"),
    ).resolves.toEqual({ ok: false, error: 'relation "nope" does not exist' });
  });

  it("has nothing to revoke without a reference row", async () => {
    await expect(
      revokeRefundedPurchaseRow("service-key", "boost", null),
    ).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });
});
