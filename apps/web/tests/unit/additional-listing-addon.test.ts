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
 * only carries the latter), which is why that is asserted too — including the
 * `subscription_data: { metadata }` on the Checkout call that is the ONLY thing
 * putting it on the subscription. Deleting that line used to leave every test
 * green while a cancelled add-on downgraded a paying host to unsubscribed.
 *
 * Two more, added when the branch was finished:
 *
 *  3. The allowance was only ever taken back on `deleted`. A subscription that
 *     expires unfinished ('incomplete_expired') may never emit one, so a host
 *     who never finished paying kept their slots. TERMINAL statuses therefore
 *     revoke — and only terminal statuses: revoking on a RECOVERABLE lapse
 *     ('unpaid' / 'paused' / 'incomplete') swept listings closed over a state
 *     Stripe can still collect from, which is the #283 review defect. The
 *     dunning configuration bounds the lapse: when Stripe gives up it cancels.
 *  4. A quantity changed in the billing portal surfaces only on
 *     customer.subscription.updated. The credit path is keyed on the checkout
 *     session, which never fires again, so the allowance never followed it.
 */

const creditListingSlotPurchase = vi.fn();
const revokeListingSlotPurchase = vi.fn();
const syncListingSlotSubscription = vi.fn();
const createCheckoutSession = vi.fn();
const syncTier = vi.fn();
const subscriptionsRetrieve = vi.fn();

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
  syncListingSlotSubscription,
}));

vi.mock("stripe", () => {
  class FakeStripe {
    static errors = { StripeError: class extends Error {} };
    checkout = { sessions: { create: createCheckoutSession } };
    customers = { retrieve: vi.fn(), search: vi.fn(), list: vi.fn(), update: vi.fn() };
    subscriptions = { list: vi.fn(), cancel: vi.fn(), retrieve: subscriptionsRetrieve };
    billingPortal = { sessions: { create: vi.fn() } };
    refunds = { create: vi.fn() };
    webhooks = { constructEvent: vi.fn() };
  }
  return { default: FakeStripe };
});

process.env.STRIPE_SECRET_KEY ??= "sk_test_addon";

const {
  ADDITIONAL_LISTING_PRODUCT_TYPE,
  createAdditionalListingCheckoutSession,
  handleStripeWebhookEvent,
  isAdditionalListingTier,
} = await import("../../services/stripe");

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

function subscriptionUpdatedEvent(args: {
  status: string;
  quantity?: number;
  metadata?: Record<string, string>;
}): WebhookEvent {
  return {
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_addon_1",
        status: args.status,
        customer: "cus_1",
        metadata: args.metadata ?? {
          productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
          clerkUserId: "user_1",
        },
        items: {
          data: [{ price: { id: "price_addon" }, quantity: args.quantity }],
        },
      },
    },
  } as unknown as WebhookEvent;
}

/**
 * What subscriptions.retrieve reports as the CURRENT state. Any non-paying
 * status is re-read before it is believed — Stripe does not order deliveries,
 * and for the add-on the stakes are resurrection: a redelivered lapse event
 * arriving after the deleted event would otherwise reinstate a revoked
 * purchase (085's sync deliberately supports reinstating a cancelled row).
 * The retrieved object must carry productType, exactly as the real one does —
 * without it the re-read would drop the event onto the plan branch.
 */
function retrievedAddonSubscription(status: string, quantity?: number) {
  return {
    id: "sub_addon_1",
    status,
    customer: "cus_1",
    metadata: {
      productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
      clerkUserId: "user_1",
    },
    items: { data: [{ price: { id: "price_addon" }, quantity }] },
  };
}

beforeEach(() => {
  creditListingSlotPurchase.mockReset();
  revokeListingSlotPurchase.mockReset();
  syncListingSlotSubscription.mockReset();
  createCheckoutSession.mockReset();
  syncTier.mockReset();
  subscriptionsRetrieve.mockReset();
  // Default: the re-read agrees with the event the tests send.
  subscriptionsRetrieve.mockImplementation(async () =>
    retrievedAddonSubscription("unpaid", 3),
  );
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

});

describe("additional-listing add-on lifecycle (non-deletion events)", () => {
  it.each(["incomplete_expired", "canceled"])(
    "TAKES THE ALLOWANCE BACK when the subscription is %s — TERMINAL, it can never collect again",
    async (status) => {
      // The original defect: this branch acted only on `deleted`, and a
      // subscription that expires unfinished may never emit one. The host kept
      // listing slots nobody was paying for. The quantity is null on purpose:
      // a non-paying payload's quantity is never believed, and entitled:false
      // zeroes the contribution regardless.
      subscriptionsRetrieve.mockResolvedValue(
        retrievedAddonSubscription(status, 3),
      );
      syncListingSlotSubscription.mockResolvedValue({
        ok: true,
        found: true,
        changed: true,
        slots: 0,
      });

      const result = await handleStripeWebhookEvent(
        subscriptionUpdatedEvent({ status, quantity: 3 }),
      );

      expect(result.action).toBe("revoked_listing_slots_terminal");
      expect(syncListingSlotSubscription).toHaveBeenCalledWith({
        stripeSubscriptionId: "sub_addon_1",
        quantity: null,
        entitled: false,
      });
      expect(syncTier).not.toHaveBeenCalled();
    },
  );

  /**
   * THE RESURRECTION SEQUENCE, pinned end to end: an updated(unpaid) event
   * 500s (db blip) → Stripe queues a redelivery → the subscription is
   * cancelled and revoked → the redelivered unpaid event arrives LAST. The
   * event's payload says unpaid (recoverable, entitled), but the subscription
   * is DEAD — and 085's sync would happily reinstate the cancelled row.
   * The re-read is what stands between that sequence and a permanently
   * resurrected free allowance: the branch acts on the CURRENT status.
   */
  it("cannot resurrect a revoked purchase from a redelivered lapse event", async () => {
    subscriptionsRetrieve.mockResolvedValue(
      retrievedAddonSubscription("canceled", 3),
    );
    syncListingSlotSubscription.mockResolvedValue({
      ok: true,
      found: true,
      changed: false,
      slots: 0,
    });

    const result = await handleStripeWebhookEvent(
      subscriptionUpdatedEvent({ status: "unpaid", quantity: 3 }),
    );

    expect(subscriptionsRetrieve).toHaveBeenCalledWith("sub_addon_1");
    expect(syncListingSlotSubscription).toHaveBeenCalledWith({
      stripeSubscriptionId: "sub_addon_1",
      quantity: null,
      entitled: false,
    });
    expect(result.action).toBe("listing_slots_unchanged");
  });

  /**
   * The follow-up defect, found reviewing #283: revoking on RECOVERABLE
   * statuses swept listings closed over a state Stripe can still collect from —
   * a retried card, a resumed pause, a paid open invoice — and the SQL sweep
   * fires the moment the contribution drops, so the harm was immediate and the
   * recovery manual. A recoverable lapse keeps the allowance; the lapse cannot
   * park forever because Stripe's dunning cancels when it gives up, which
   * arrives as `canceled` above or as the deleted event.
   */
  it.each(["unpaid", "paused", "incomplete"])(
    "KEEPS the allowance while the subscription is %s — a recoverable lapse, not a revocation",
    async (status) => {
      subscriptionsRetrieve.mockResolvedValue(
        retrievedAddonSubscription(status, 3),
      );
      syncListingSlotSubscription.mockResolvedValue({
        ok: true,
        found: true,
        changed: false,
        slots: 3,
      });

      const result = await handleStripeWebhookEvent(
        subscriptionUpdatedEvent({ status, quantity: 3 }),
      );

      expect(result.action).toBe("listing_slots_unchanged");
      // quantity null: the recorded quantity is left alone while nothing is
      // collecting. The billing portal accepts quantity updates on a
      // non-collecting subscription, and believing one would grant slots
      // against an invoice that may never be attempted.
      expect(syncListingSlotSubscription).toHaveBeenCalledWith({
        stripeSubscriptionId: "sub_addon_1",
        quantity: null,
        entitled: true,
      });
      expect(syncTier).not.toHaveBeenCalled();
    },
  );

  it("does NOT believe a quantity raised while nothing is collecting", async () => {
    // A host in `unpaid` raises quantity 1 -> 10 in the billing portal. The
    // event carries 10; nothing will ever collect for it. The recorded
    // quantity must stay put until real collection resumes (an active-status
    // event, which IS believed — see 'FOLLOWS a quantity changed').
    subscriptionsRetrieve.mockResolvedValue(
      retrievedAddonSubscription("unpaid", 10),
    );
    syncListingSlotSubscription.mockResolvedValue({
      ok: true,
      found: true,
      changed: false,
      slots: 1,
    });

    await handleStripeWebhookEvent(
      subscriptionUpdatedEvent({ status: "unpaid", quantity: 10 }),
    );

    expect(syncListingSlotSubscription.mock.calls[0][0].quantity).toBeNull();
  });

  it.each(["active", "trialing", "past_due"])(
    "keeps the allowance while the subscription is %s",
    async (status) => {
      syncListingSlotSubscription.mockResolvedValue({
        ok: true,
        found: true,
        changed: false,
        slots: 2,
      });

      const result = await handleStripeWebhookEvent(
        subscriptionUpdatedEvent({ status, quantity: 2 }),
      );

      expect(result.action).toBe("listing_slots_unchanged");
      expect(syncListingSlotSubscription.mock.calls[0][0].entitled).toBe(true);
    },
  );

  it("FOLLOWS a quantity changed in the billing portal", async () => {
    // The defect: crediting is keyed on the checkout session, which never fires
    // again, so a portal-side quantity change moved the invoice and not the
    // allowance.
    syncListingSlotSubscription.mockResolvedValue({
      ok: true,
      found: true,
      changed: true,
      slots: 5,
    });

    const result = await handleStripeWebhookEvent(
      subscriptionUpdatedEvent({ status: "active", quantity: 5 }),
    );

    expect(result.action).toBe("synced_listing_slots");
    expect(syncListingSlotSubscription.mock.calls[0][0].quantity).toBe(5);
  });

  it("sends a NULL quantity when Stripe did not state one, so nothing is invented", async () => {
    syncListingSlotSubscription.mockResolvedValue({
      ok: true,
      found: true,
      changed: false,
      slots: 1,
    });

    await handleStripeWebhookEvent(subscriptionUpdatedEvent({ status: "active" }));

    expect(syncListingSlotSubscription.mock.calls[0][0].quantity).toBeNull();
  });

  it("reports a subscription we hold no purchase for, without failing the webhook", async () => {
    // customer.subscription.created routinely arrives before the checkout
    // session credited the ledger row.
    syncListingSlotSubscription.mockResolvedValue({
      ok: true,
      found: false,
      changed: false,
      slots: 0,
    });

    const result = await handleStripeWebhookEvent(
      subscriptionUpdatedEvent({ status: "active", quantity: 1 }),
    );

    expect(result.action).toBe("listing_slots_purchase_not_found");
  });

  it("THROWS when the sync could not be recorded, so Stripe redelivers", async () => {
    syncListingSlotSubscription.mockResolvedValue({
      ok: false,
      found: false,
      changed: false,
      slots: 0,
    });

    await expect(
      handleStripeWebhookEvent(subscriptionUpdatedEvent({ status: "unpaid" })),
    ).rejects.toThrow(/could not be synced/);
  });

  it("NEVER writes a subscription tier from an add-on lifecycle event", async () => {
    syncListingSlotSubscription.mockResolvedValue({
      ok: true,
      found: true,
      changed: true,
      slots: 0,
    });

    const result = await handleStripeWebhookEvent(
      subscriptionUpdatedEvent({ status: "unpaid", quantity: 1 }),
    );

    expect(result.tier).toBeNull();
    expect(syncTier).not.toHaveBeenCalled();
  });

  it("leaves a NON-add-on subscription to the plan path", async () => {
    const result = await handleStripeWebhookEvent(
      subscriptionUpdatedEvent({
        status: "active",
        metadata: { clerkUserId: "user_1" },
      }),
    );

    expect(syncListingSlotSubscription).not.toHaveBeenCalled();
    // No mapped price id in this environment, so the plan path declines to guess.
    expect(result.action).toBe("ignored_unmapped_subscription_price");
  });
});

describe("additional-listing add-on checkout session", () => {
  it("puts the productType metadata on the SUBSCRIPTION, not only the session", async () => {
    // This is the assertion that was missing: `subscription_data: { metadata }`
    // could be deleted and 606 of 606 tests still passed. It is the ONLY thing
    // that puts productType on the subscription object — and every cancellation
    // and lifecycle event carries the subscription, never the session. Without
    // it, cancelling an add-on falls through to the plan branch and writes a
    // paying host's subscription_tier down to 'none'.
    createCheckoutSession.mockResolvedValue({ id: "cs_1", url: "https://stripe" });

    await createAdditionalListingCheckoutSession({
      clerkUserId: "user_1",
      hostProfileId: "host-1",
      hostSubscriptionTier: "professional",
      quantity: 2,
    });

    const params = createCheckoutSession.mock.calls[0][0];
    expect(params.subscription_data?.metadata).toMatchObject({
      productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
      hostProfileId: "host-1",
      clerkUserId: "user_1",
      quantity: "2",
      tier: "professional",
    });
    // Both objects carry it: the session drives crediting, the subscription
    // drives cancellation.
    expect(params.metadata).toMatchObject({
      productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
    });
    expect(params.mode).toBe("subscription");
  });

  it("REFUSES to recognise an unsubscribed host as a buyable tier — there is no free tier", () => {
    // includedListingCapFor('none') is 0 and this map has no 'none' key, so
    // there is no rate at which an unsubscribed host can be quoted. Together
    // they close the arbitrage: Starter's allowance without Starter's price.
    expect(isAdditionalListingTier("none")).toBe(false);
    expect(isAdditionalListingTier("starter")).toBe(true);
    expect(isAdditionalListingTier("professional")).toBe(true);
    expect(isAdditionalListingTier("enterprise")).toBe(true);
  });
});
