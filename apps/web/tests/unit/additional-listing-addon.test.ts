import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The additional-listing add-on's Stripe wiring.
 *
 * TWO defects are pinned here, and both are about the add-on being a RECURRING
 * product — which is what the founder-locked price says it is ("$99/$75/$49 per
 * extra active listing, MONTHLY"), and which means a buyer ends up holding two
 * Stripe subscriptions at once:
 *
 *  1. syncCheckoutCompleted's plan branch triggers on `session.mode ===
 *     "subscription"`. The add-on's session has exactly that mode, so unless the
 *     productType branch runs FIRST, buying an extra listing would be processed
 *     as a plan purchase.
 *
 *  2. syncSubscriptionEvent hard-codes `tier = "none"` whenever `deleted` is
 *     true, without consulting the price. So cancelling the ADD-ON would write a
 *     paying Enterprise host's subscription_tier down to unsubscribed — silently
 *     revoking the plan they still pay for.
 *
 * Both depend on metadata.productType being present on the SESSION *and* on the
 * SUBSCRIPTION (they are different Stripe objects and the cancellation event
 * only carries the latter), which is why that is asserted too.
 */

const creditListingSlotPurchase = vi.fn();
const revokeListingSlotPurchase = vi.fn();
const syncTier = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@explore-and-earn/db", () => ({
  adminClient: () => ({
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: (_column: string, value: string) => {
          syncTier(value, values);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
  activateBoostCampaignFromCheckout: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  recordInvitePackPurchase: vi.fn(),
  creditListingSlotPurchase,
  revokeListingSlotPurchase,
}));

vi.mock("stripe", () => {
  class FakeStripe {
    static errors = { StripeError: class extends Error {} };
    checkout = { sessions: { create: vi.fn() } };
    customers = { retrieve: vi.fn(), search: vi.fn(), list: vi.fn(), update: vi.fn() };
    subscriptions = { list: vi.fn(), cancel: vi.fn() };
    billingPortal = { sessions: { create: vi.fn() } };
    refunds = { create: vi.fn() };
    webhooks = { constructEvent: vi.fn() };
  }
  return { default: FakeStripe };
});

const { ADDITIONAL_LISTING_PRODUCT_TYPE, handleStripeWebhookEvent } = await import(
  "../../services/stripe"
);

type WebhookEvent = Parameters<typeof handleStripeWebhookEvent>[0];

function checkoutEvent(overrides: Record<string, unknown>): WebhookEvent {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_addon_1",
        mode: "subscription",
        payment_status: "paid",
        subscription: "sub_addon_1",
        ...overrides,
      },
    },
  } as unknown as WebhookEvent;
}

function subscriptionDeletedEvent(metadata: Record<string, string>): WebhookEvent {
  return {
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_addon_1",
        status: "canceled",
        customer: "cus_1",
        metadata,
        items: { data: [{ price: { id: "price_addon" } }] },
      },
    },
  } as unknown as WebhookEvent;
}

beforeEach(() => {
  creditListingSlotPurchase.mockReset();
  revokeListingSlotPurchase.mockReset();
  syncTier.mockReset();
});

describe("additional-listing add-on checkout", () => {
  it("credits the allowance and NEVER writes a subscription tier", async () => {
    creditListingSlotPurchase.mockResolvedValue({ ok: true, alreadyCredited: false });

    const result = await handleStripeWebhookEvent(
      checkoutEvent({
        metadata: {
          productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
          hostProfileId: "host-1",
          clerkUserId: "user_1",
          quantity: "2",
          tier: "starter",
        },
      }),
    );

    expect(result.action).toBe("credited_listing_slots");
    expect(creditListingSlotPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        hostProfileId: "host-1",
        quantity: 2,
        stripeCheckoutSessionId: "cs_test_addon_1",
        stripeSubscriptionId: "sub_addon_1",
      }),
    );
    expect(syncTier).not.toHaveBeenCalled();
  });

  it("reports the repeat delivery as already credited", async () => {
    creditListingSlotPurchase.mockResolvedValue({ ok: true, alreadyCredited: true });

    const result = await handleStripeWebhookEvent(
      checkoutEvent({
        metadata: {
          productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
          hostProfileId: "host-1",
          quantity: "2",
          tier: "starter",
        },
      }),
    );

    expect(result.action).toBe("listing_slots_already_credited");
  });

  it("THROWS when the credit could not be recorded, so Stripe redelivers instead of the money vanishing", async () => {
    creditListingSlotPurchase.mockResolvedValue({ ok: false, alreadyCredited: false });

    await expect(
      handleStripeWebhookEvent(
        checkoutEvent({
          metadata: {
            productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
            hostProfileId: "host-1",
            quantity: "1",
            tier: "starter",
          },
        }),
      ),
    ).rejects.toThrow(/could not be recorded/);
  });

  it("grants NOTHING on a completed-but-unpaid session", async () => {
    const result = await handleStripeWebhookEvent(
      checkoutEvent({
        payment_status: "unpaid",
        metadata: {
          productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
          hostProfileId: "host-1",
          quantity: "1",
          tier: "starter",
        },
      }),
    );

    expect(result.action).toBe("deferred_unpaid_checkout");
    expect(creditListingSlotPurchase).not.toHaveBeenCalled();
  });

  it("REFUSES a quantity beyond the per-checkout ceiling", async () => {
    const result = await handleStripeWebhookEvent(
      checkoutEvent({
        metadata: {
          productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
          hostProfileId: "host-1",
          quantity: "10000",
          tier: "starter",
        },
      }),
    );

    expect(result.action).toBe("ignored_invalid_listing_slot_quantity");
    expect(creditListingSlotPurchase).not.toHaveBeenCalled();
  });
});

describe("additional-listing add-on cancellation", () => {
  it("revokes the allowance and NEVER downgrades the host's plan tier", async () => {
    revokeListingSlotPurchase.mockResolvedValue({
      ok: true,
      found: true,
      alreadyRevoked: false,
    });

    const result = await handleStripeWebhookEvent(
      subscriptionDeletedEvent({
        productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
        clerkUserId: "user_1",
      }),
    );

    expect(result.action).toBe("revoked_listing_slots");
    expect(result.tier).toBeNull();
    // The defect: without the add-on branch this call would have written
    // subscription_tier = 'none' for a host who still pays for their plan.
    expect(syncTier).not.toHaveBeenCalled();
  });

  it("is idempotent on a redelivered cancellation", async () => {
    revokeListingSlotPurchase.mockResolvedValue({
      ok: true,
      found: true,
      alreadyRevoked: true,
    });

    const result = await handleStripeWebhookEvent(
      subscriptionDeletedEvent({ productType: ADDITIONAL_LISTING_PRODUCT_TYPE }),
    );

    expect(result.action).toBe("listing_slots_already_revoked");
  });

  it("THROWS when the allowance could not be revoked, so the retry can correct it", async () => {
    revokeListingSlotPurchase.mockResolvedValue({
      ok: false,
      found: false,
      alreadyRevoked: false,
    });

    await expect(
      handleStripeWebhookEvent(
        subscriptionDeletedEvent({ productType: ADDITIONAL_LISTING_PRODUCT_TYPE }),
      ),
    ).rejects.toThrow(/could not be revoked/);
  });

  it("does not touch the allowance on an ordinary add-on lifecycle update", async () => {
    const result = await handleStripeWebhookEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_addon_1",
          status: "active",
          customer: "cus_1",
          metadata: { productType: ADDITIONAL_LISTING_PRODUCT_TYPE },
          items: { data: [{ price: { id: "price_addon" } }] },
        },
      },
    } as unknown as WebhookEvent);

    expect(result.action).toBe("ignored_additional_listing_subscription_update");
    expect(revokeListingSlotPurchase).not.toHaveBeenCalled();
    expect(syncTier).not.toHaveBeenCalled();
  });
});
