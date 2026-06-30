/**
 * Unit tests for the announcement-purchase idempotency guard in
 * packages/db/src/queries/community.ts (insertHostAnnouncement).
 *
 * Stripe delivers checkout.session.completed AT LEAST ONCE, so a retried webhook
 * must not grant a second paid announcement draft (migration 049 + the dedupe
 * on stripe_checkout_session_id). These tests mock the service-role client so no
 * DB or env vars are needed. See the matching guard in boostPurchase.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// maybeSingle() backs the lookup + the post-race re-read (a queue so a single
// test can return "not found" then "found"); single() backs the insert .select.
let maybeSingleQueue: Array<{ data: unknown; error: unknown }> = [];
let singleResult: { data: unknown; error: unknown } = { data: null, error: null };
const inserted: Array<Record<string, unknown>> = [];
let maybeSingleCalls = 0;

vi.mock("../src/adminClient", () => ({
  adminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: (obj: Record<string, unknown>) => {
          inserted.push(obj);
          return builder;
        },
        eq: () => builder,
        maybeSingle: () => {
          maybeSingleCalls += 1;
          return Promise.resolve(
            maybeSingleQueue.shift() ?? { data: null, error: null },
          );
        },
        single: () => Promise.resolve(singleResult),
      };
      return builder;
    },
  }),
}));

const { insertHostAnnouncement } = await import("../src/queries/community");

const BASE = {
  hostProfileId: "host-1",
  title: "",
  body: "",
  kind: "general" as const,
  expiresAt: "2026-07-30T00:00:00.000Z",
  status: "draft" as const,
  purchaseDurationDays: 7,
  purchaseAmountCents: 15000,
};

afterEach(() => {
  maybeSingleQueue = [];
  singleResult = { data: null, error: null };
  inserted.length = 0;
  maybeSingleCalls = 0;
});

describe("insertHostAnnouncement — Checkout Session idempotency", () => {
  it("returns the existing draft and does NOT insert when the session already exists", async () => {
    maybeSingleQueue = [{ data: { id: "existing-1" }, error: null }];

    const result = await insertHostAnnouncement({
      ...BASE,
      stripeCheckoutSessionId: "cs_test_dup",
    });

    expect(result.id).toBe("existing-1");
    expect(inserted).toHaveLength(0); // the double-grant is prevented
  });

  it("inserts once, persisting the session id, on the first delivery", async () => {
    maybeSingleQueue = [{ data: null, error: null }]; // no existing row
    singleResult = { data: { id: "new-1" }, error: null };

    const result = await insertHostAnnouncement({
      ...BASE,
      stripeCheckoutSessionId: "cs_test_new",
    });

    expect(result.id).toBe("new-1");
    expect(inserted).toHaveLength(1);
    expect(inserted[0].stripe_checkout_session_id).toBe("cs_test_new");
    expect(inserted[0].purchase_amount_cents).toBe(15000);
  });

  it("recovers via re-read when the unique index races a concurrent insert", async () => {
    maybeSingleQueue = [
      { data: null, error: null }, // initial lookup: not found
      { data: { id: "raced-1" }, error: null }, // post-23505 re-read: found
    ];
    singleResult = { data: null, error: { code: "23505", message: "dup" } };

    const result = await insertHostAnnouncement({
      ...BASE,
      stripeCheckoutSessionId: "cs_test_race",
    });

    expect(result.id).toBe("raced-1");
  });

  it("skips the dedupe lookup entirely when no session id is supplied (back-compat)", async () => {
    singleResult = { data: { id: "new-2" }, error: null };

    const result = await insertHostAnnouncement({ ...BASE });

    expect(result.id).toBe("new-2");
    expect(maybeSingleCalls).toBe(0); // no lookup without a session id
    expect(inserted[0].stripe_checkout_session_id).toBeNull();
  });
});
