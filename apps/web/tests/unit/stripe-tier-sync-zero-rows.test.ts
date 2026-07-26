/**
 * A paid tier that matched no host profile must NOT look like a successful grant.
 *
 * The defect this pins: syncHostSubscriptionTier ran an UPDATE on host_profiles
 * filtered by clerk_user_id and checked only `error`. Supabase answers a
 * zero-row UPDATE with { data: null/[], error: null }, so a host who paid before
 * their host_profiles row existed was charged, granted nothing, and the webhook
 * still returned 200 — Stripe never retried and no one ever found out.
 *
 * The fix asks for the affected rows (.select("id")) and throws when none came
 * back, which makes the webhook route answer non-2xx so Stripe redelivers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("server-only", () => ({}));

interface UpdateCall {
  readonly table: string;
  readonly method: string;
  readonly args: readonly unknown[];
}

const calls: UpdateCall[] = [];
let updateResult: { data: unknown; error: unknown } = { data: [{ id: "host-1" }], error: null };

function makeBuilder(table: string): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  for (const method of ["update", "eq", "select"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
  }
  const settle = () => Promise.resolve(updateResult);
  builder.maybeSingle = settle;
  builder.single = settle;
  builder.then = (onFulfilled: unknown, onRejected: unknown) =>
    settle().then(onFulfilled as never, onRejected as never);
  return builder;
}

vi.mock("@explore-and-earn/db", () => ({
  adminClient: () => ({ from: (table: string) => makeBuilder(table) }),
  activateBoostCampaignFromCheckout: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  recordInvitePackPurchase: vi.fn(),
}));

const { handleStripeWebhookEvent } = await import("../../services/stripe");

/** A paid subscription checkout carrying a valid tier and clerk id. */
function paidSubscriptionCheckout(): Stripe.Event {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        mode: "subscription",
        payment_status: "paid",
        customer: null,
        client_reference_id: null,
        metadata: { clerkUserId: "user_paid", subscriptionTier: "starter" },
      },
    },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  calls.length = 0;
  updateResult = { data: [{ id: "host-1" }], error: null };
});

describe("host tier sync after a real payment", () => {
  it("asks the database which rows it changed", async () => {
    await handleStripeWebhookEvent(paidSubscriptionCheckout());

    expect(calls).toContainEqual({
      table: "host_profiles",
      method: "update",
      args: [{ subscription_tier: "starter" }],
    });
    // Without a select the zero-row case is indistinguishable from success.
    expect(calls.some((c) => c.table === "host_profiles" && c.method === "select")).toBe(
      true,
    );
  });

  it("grants the tier when a host profile matched", async () => {
    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).resolves.toEqual(
      expect.objectContaining({ action: "synced_checkout_session", tier: "starter" }),
    );
  });

  /**
   * The refusal: no matching host profile means the payer got nothing, so the
   * webhook must fail loudly and let Stripe redeliver — never resolve happily.
   */
  it("throws when the update matched ZERO host_profiles rows", async () => {
    updateResult = { data: [], error: null };

    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).rejects.toThrow(
      /no host_profiles row matched/i,
    );
  });

  it("throws when the driver returns no rows at all", async () => {
    updateResult = { data: null, error: null };

    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).rejects.toThrow(
      /no host_profiles row matched/i,
    );
  });

  it("does not leak the paying Clerk user id into the thrown message", async () => {
    updateResult = { data: [], error: null };

    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("user_paid"),
      }) as Error,
    );
  });

  it("still surfaces a real database error", async () => {
    updateResult = { data: null, error: { message: "permission denied" } };

    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).rejects.toThrow(
      /permission denied/i,
    );
  });
});
