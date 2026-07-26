/**
 * Claiming a refund request before any money moves.
 *
 * The defect this pins: the approve path called Stripe first and only then ran
 * markRefundResolved's conditional update. That update is correct but it fires
 * too late — two concurrent approvals could both read 'requested', both issue a
 * real refund, and only then race on the write, so one payout was recorded and
 * two were made.
 *
 * claimRefundForProcessing moves the row 'requested' -> 'approved' FIRST. The
 * second caller loses that update and must never reach Stripe. These tests
 * assert the conditional filter and the losing-claim refusal at the db layer;
 * the ordering of claim-then-Stripe is asserted in the web action test.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface Call {
  readonly table: string;
  readonly method: string;
  readonly args: readonly unknown[];
}

const calls: Call[] = [];
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

const { claimRefundForProcessing, markRefundResolved } = await import(
  "../src/queries/refunds"
);

afterEach(() => {
  calls.length = 0;
  nextResult = { data: null, error: null };
});

function eqArgs(): unknown[][] {
  return calls.filter((c) => c.method === "eq").map((c) => [...c.args]);
}

function updatePatch(): Record<string, unknown> {
  const update = calls.find((c) => c.method === "update");
  return (update?.args[0] ?? {}) as Record<string, unknown>;
}

describe("claimRefundForProcessing", () => {
  it("moves a still-open request into the in-flight status, conditionally", async () => {
    nextResult = { data: { id: "req-1" }, error: null };

    await expect(
      claimRefundForProcessing("service-key", {
        requestId: "req-1",
        adminClerkUserId: "user_admin",
      }),
    ).resolves.toEqual({ ok: true });

    expect(updatePatch().status).toBe("approved");
    expect(updatePatch().resolved_by_clerk_user_id).toBe("user_admin");
    // The claim is what makes it safe: it only lands on a row still 'requested'.
    expect(eqArgs()).toContainEqual(["status", "requested"]);
    expect(eqArgs()).toContainEqual(["id", "req-1"]);
  });

  /** The refusal: a row someone else already claimed matches zero rows. */
  it("refuses when the row is no longer in the requested state", async () => {
    nextResult = { data: null, error: null };

    const result = await claimRefundForProcessing("service-key", {
      requestId: "req-1",
      adminClerkUserId: "user_admin",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already being processed|already resolved/i);
  });

  it("does not stamp resolved_at — the request is in flight, not resolved", async () => {
    nextResult = { data: { id: "req-1" }, error: null };
    await claimRefundForProcessing("service-key", {
      requestId: "req-1",
      adminClerkUserId: "user_admin",
    });
    expect(updatePatch()).not.toHaveProperty("resolved_at");
  });

  it("refuses without a request id or an admin id", async () => {
    await expect(
      claimRefundForProcessing("service-key", { requestId: "", adminClerkUserId: "a" }),
    ).resolves.toEqual({ ok: false, error: "Missing request id." });
    await expect(
      claimRefundForProcessing("service-key", { requestId: "r", adminClerkUserId: "" }),
    ).resolves.toEqual({ ok: false, error: "Missing admin id." });
    expect(calls).toHaveLength(0);
  });
});

describe("markRefundResolved guards the status it advances from", () => {
  it("advances from the in-flight status when the caller claimed the row", async () => {
    nextResult = { data: { id: "req-1" }, error: null };

    await expect(
      markRefundResolved("service-key", {
        requestId: "req-1",
        status: "refunded",
        adminClerkUserId: "user_admin",
        fromStatus: "approved",
      }),
    ).resolves.toEqual({ ok: true });

    expect(eqArgs()).toContainEqual(["status", "approved"]);
    expect(eqArgs()).not.toContainEqual(["status", "requested"]);
  });

  it("still defaults to the open status for the deny path, which skips Stripe", async () => {
    nextResult = { data: { id: "req-1" }, error: null };

    await markRefundResolved("service-key", {
      requestId: "req-1",
      status: "denied",
      adminClerkUserId: "user_admin",
    });

    expect(eqArgs()).toContainEqual(["status", "requested"]);
  });
});
