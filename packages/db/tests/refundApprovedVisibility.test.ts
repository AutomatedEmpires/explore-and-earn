/**
 * 'approved' is a PERSISTED state in which Stripe may already have paid out.
 *
 * The defect this pins: claimRefundForProcessing started writing 'approved'
 * before the Stripe call, and nothing else learned about it.
 *
 *   * getRefundStats counted requested/refunded/denied/failed, so a row that
 *     was claimed and never resolved — an approval that died between the claim
 *     and recording its outcome — appeared on NO operator surface and in NO
 *     reconciliation number. The money was gone and the count said zero.
 *   * getRefundQueue sorted only 'requested' to the top, so the one row that
 *     most needs a human sank into the resolved history.
 *   * getHostRefundablePurchases treated only 'requested' as open, so a
 *     purchase whose refund was in flight was offered back to the host as
 *     freshly refundable.
 *
 * The fake below answers from a real row list rather than replaying canned
 * results, so a status the code forgets to ask about shows up as a wrong NUMBER
 * here rather than as an argument these assertions happen to quote.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface RefundRow {
  readonly id: string;
  readonly host_profile_id: string;
  readonly purchase_type: string;
  readonly reference_id: string | null;
  readonly status: string;
  readonly amount_cents: number;
  readonly created_at: string;
}

interface PurchaseRow {
  readonly id: string;
  readonly host_profile_id: string;
  readonly stripe_payment_intent_id: string | null;
  readonly purchase_amount_cents: number;
  readonly created_at: string;
  readonly title?: string;
  readonly purchase_duration_days?: number;
}

const tables: Record<string, unknown[]> = {
  refund_requests: [],
  host_announcements: [],
  listing_boost_campaigns: [],
};

interface Filter {
  readonly column: string;
  readonly values: readonly unknown[];
  readonly negated: boolean;
}

function makeBuilder(table: string) {
  const filters: Filter[] = [];
  let head = false;

  function matching(): Record<string, unknown>[] {
    return (tables[table] as Record<string, unknown>[]).filter((row) =>
      filters.every((f) => {
        const hit = f.values.includes(row[f.column] ?? null);
        return f.negated ? !hit : hit;
      }),
    );
  }

  const builder: Record<string, unknown> = {
    select(_columns?: unknown, opts?: { head?: boolean }) {
      head = opts?.head === true;
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, values: [value], negated: false });
      return builder;
    },
    is(column: string, value: unknown) {
      filters.push({ column, values: [value], negated: false });
      return builder;
    },
    not(column: string, _op: string, value: unknown) {
      filters.push({ column, values: [value], negated: true });
      return builder;
    },
    in(column: string, values: readonly unknown[]) {
      filters.push({ column, values, negated: false });
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    then(onFulfilled: unknown, onRejected: unknown) {
      const rows = matching();
      const result = head
        ? { data: null, error: null, count: rows.length }
        : { data: rows, error: null, count: rows.length };
      return Promise.resolve(result).then(onFulfilled as never, onRejected as never);
    },
  };
  return builder;
}

vi.mock("../src/adminClient", () => ({
  adminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

const { getRefundStats, getRefundQueue, getHostRefundablePurchases } =
  await import("../src/queries/refunds");
const { isUnresolvedRefundStatus, isActionableRefundStatus } = await import(
  "../src/lib/refundStatus"
);

const HOST = "host-1";

function refund(over: Partial<RefundRow> & { id: string; status: string }): RefundRow {
  return {
    host_profile_id: HOST,
    purchase_type: "boost",
    reference_id: null,
    amount_cents: 1000,
    created_at: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  tables.refund_requests = [];
  tables.host_announcements = [];
  tables.listing_boost_campaigns = [];
});

describe("getRefundStats surfaces the claimed lane", () => {
  it("counts 'approved' rows and the money sitting in them", async () => {
    tables.refund_requests = [
      refund({ id: "r1", status: "requested", amount_cents: 500 }),
      refund({ id: "r2", status: "approved", amount_cents: 19900 }),
      refund({ id: "r3", status: "approved", amount_cents: 100 }),
      refund({ id: "r4", status: "refunded", amount_cents: 2500 }),
      refund({ id: "r5", status: "denied", amount_cents: 300 }),
      refund({ id: "r6", status: "failed", amount_cents: 400 }),
    ];

    const stats = await getRefundStats("service-key");

    expect(stats.approved).toBe(2);
    expect(stats.approvedCents).toBe(20000);

    // The other lanes are unchanged, and the claimed money is NOT folded into
    // the refunded total — it is money to reconcile, not money confirmed back.
    expect(stats).toMatchObject({
      requested: 1,
      refunded: 1,
      denied: 1,
      failed: 1,
      refundedCents: 2500,
    });
  });

  /**
   * The negative control. A claimed-and-abandoned request is the whole reason
   * this lane exists: every other counter reads zero for it, so if 'approved'
   * is not counted the operator sees a completely clear board.
   */
  it("does not report a clear board when the only row is claimed and stuck", async () => {
    tables.refund_requests = [
      refund({ id: "stuck", status: "approved", amount_cents: 19900 }),
    ];

    const stats = await getRefundStats("service-key");

    expect(stats.requested).toBe(0);
    expect(stats.refunded).toBe(0);
    expect(stats.denied).toBe(0);
    expect(stats.failed).toBe(0);
    // ...and yet there is something to act on.
    expect(stats.approved).toBe(1);
    expect(stats.approvedCents).toBe(19900);
  });

  it("counts every status 047 declares", async () => {
    tables.refund_requests = [
      refund({ id: "a", status: "requested" }),
      refund({ id: "b", status: "approved" }),
      refund({ id: "c", status: "denied" }),
      refund({ id: "d", status: "refunded" }),
      refund({ id: "e", status: "failed" }),
    ];

    const stats = await getRefundStats("service-key");
    const counted =
      stats.requested + stats.approved + stats.denied + stats.refunded + stats.failed;

    expect(counted).toBe(tables.refund_requests.length);
  });
});

describe("getRefundQueue keeps a claimed row in view", () => {
  it("filters to the 'approved' lane", async () => {
    tables.refund_requests = [
      refund({ id: "r1", status: "requested" }),
      refund({ id: "r2", status: "approved" }),
      refund({ id: "r3", status: "refunded" }),
    ];

    const rows = await getRefundQueue("service-key", "approved");

    expect(rows.map((r) => r.id)).toEqual(["r2"]);
  });

  it("sorts a claimed row above resolved history, not below it", async () => {
    tables.refund_requests = [
      refund({
        id: "resolved-today",
        status: "refunded",
        created_at: "2026-07-20T00:00:00.000Z",
      }),
      refund({
        id: "claimed-last-week",
        status: "approved",
        created_at: "2026-07-13T00:00:00.000Z",
      }),
    ];

    const rows = await getRefundQueue("service-key");

    expect(rows.map((r) => r.id)).toEqual(["claimed-last-week", "resolved-today"]);
  });
});

describe("getHostRefundablePurchases does not re-offer a refund in flight", () => {
  beforeEach(() => {
    tables.listing_boost_campaigns = [
      {
        id: "campaign-1",
        host_profile_id: HOST,
        stripe_payment_intent_id: "pi_1",
        purchase_amount_cents: 20000,
        purchase_duration_days: 14,
        created_at: "2026-07-01T00:00:00.000Z",
      } satisfies PurchaseRow,
    ];
  });

  it("marks a purchase whose refund is CLAIMED as already open", async () => {
    tables.refund_requests = [
      refund({
        id: "r1",
        status: "approved",
        purchase_type: "boost",
        reference_id: "campaign-1",
      }),
    ];

    const [purchase] = await getHostRefundablePurchases("service-key", HOST);

    expect(purchase.hasOpenRequest).toBe(true);
    // Not yet refunded — the Stripe outcome has not been recorded — so the two
    // flags must not be conflated.
    expect(purchase.alreadyRefunded).toBe(false);
  });

  it("still marks a merely requested refund as open", async () => {
    tables.refund_requests = [
      refund({
        id: "r1",
        status: "requested",
        purchase_type: "boost",
        reference_id: "campaign-1",
      }),
    ];

    const [purchase] = await getHostRefundablePurchases("service-key", HOST);
    expect(purchase.hasOpenRequest).toBe(true);
  });

  /** A resolved request must NOT block a new one. */
  it.each(["denied", "failed"])(
    "leaves a purchase refundable after a %s request",
    async (status) => {
      tables.refund_requests = [
        refund({
          id: "r1",
          status,
          purchase_type: "boost",
          reference_id: "campaign-1",
        }),
      ];

      const [purchase] = await getHostRefundablePurchases("service-key", HOST);
      expect(purchase.hasOpenRequest).toBe(false);
      expect(purchase.alreadyRefunded).toBe(false);
    },
  );
});

describe("the two open-ness questions are not the same question", () => {
  it("treats 'approved' as unresolved but NOT as actionable", () => {
    // Unresolved: it still needs a human.
    expect(isUnresolvedRefundStatus("approved")).toBe(true);
    // Actionable: offering Approve/Deny would offer a second payout.
    expect(isActionableRefundStatus("approved")).toBe(false);

    expect(isUnresolvedRefundStatus("requested")).toBe(true);
    expect(isActionableRefundStatus("requested")).toBe(true);

    for (const terminal of ["denied", "refunded", "failed"]) {
      expect(isUnresolvedRefundStatus(terminal)).toBe(false);
      expect(isActionableRefundStatus(terminal)).toBe(false);
    }
  });
});
