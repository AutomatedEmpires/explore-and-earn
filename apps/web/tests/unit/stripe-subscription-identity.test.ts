/**
 * The Stripe webhook must record subscription state against the CLERK IDENTITY,
 * not only against a host profile row.
 *
 * The defect this pins: syncHostSubscriptionTier was a single
 * `UPDATE host_profiles SET subscription_tier = ... WHERE clerk_user_id = ...`.
 * That matches zero rows for a customer who pays BEFORE onboarding — which,
 * after migration 083, is the normal order of events, because a host cannot
 * create a profile without a plan. The payment landed, the UPDATE reported
 * success on nothing, and the host was then refused the profile they had just
 * paid for.
 *
 * public.host_subscriptions is keyed by clerk_user_id and exists from sign-up
 * onward, so it can carry the fact through that window.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertHostSubscriptionMock = vi.hoisted(() => vi.fn());
const closeListingsMock = vi.hoisted(() => vi.fn());
const getHostSubscriptionMock = vi.hoisted(() => vi.fn());
const hostProfilesUpdate = vi.hoisted(() => vi.fn());
const stripeCustomersRetrieve = vi.hoisted(() => vi.fn());
const stripeCustomersUpdate = vi.hoisted(() => vi.fn());

/**
 * What the host_profiles UPDATE reports back. A grant that matches a profile
 * returns the row; the pay-before-onboarding case returns an empty array, which
 * is what the zero-row cases below turn on.
 */
const hostProfilesResult = vi.hoisted(
  () => ({ current: { data: [{ id: "host-1" }], error: null } }) as {
    current: { data: unknown; error: unknown };
  },
);

/**
 * What the follow-up "is there a profile at all?" read reports back. Empty is
 * the pay-before-onboarding shape, which 083 makes the NORMAL state at payment
 * time — a host cannot create a profile until they have paid.
 */
const hostProfilesProbe = vi.hoisted(
  () => ({ current: { data: [], error: null } }) as {
    current: { data: unknown; error: unknown };
  },
);

vi.mock("server-only", () => ({}));

vi.mock("@explore-and-earn/db", () => ({
  adminClient: () => ({
    from: () => {
      // Two chains run against the same table and predicate: the UPDATE, and
      // the read-back that decides what a zero-row UPDATE meant.
      const chain: Record<string, unknown> = {};
      let settle = () => Promise.resolve(hostProfilesProbe.current);
      chain.update = (values: unknown) => {
        hostProfilesUpdate(values);
        // .select("id") is how the caller tells "wrote the tier" apart from
        // "matched nothing" — Supabase reports both as error: null.
        settle = () => Promise.resolve(hostProfilesResult.current);
        return chain;
      };
      chain.eq = () => chain;
      chain.limit = () => chain;
      chain.select = () => chain;
      chain.then = (onFulfilled: unknown, onRejected: unknown) =>
        settle().then(onFulfilled as never, onRejected as never);
      return chain;
    },
  }),
  activateBoostCampaignFromCheckout: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  recordInvitePackPurchase: vi.fn(),
  revokeListingSlotPurchase: vi.fn(),
  upsertHostSubscription: upsertHostSubscriptionMock,
  closeHostListingsOverAllowance: closeListingsMock,
  getHostSubscriptionByClerkUserId: getHostSubscriptionMock,
}));

vi.mock("stripe", () => ({
  default: class {
    customers = {
      retrieve: stripeCustomersRetrieve,
      update: stripeCustomersUpdate,
      list: vi.fn(),
      search: vi.fn(),
    };
  },
}));

import { handleStripeWebhookEvent } from "../../services/stripe";

beforeEach(() => {
  vi.clearAllMocks();
  hostProfilesResult.current = { data: [{ id: "host-1" }], error: null };
  hostProfilesProbe.current = { data: [], error: null };
  closeListingsMock.mockResolvedValue(0);
  // Default: the database has no subscription id recorded, which is the
  // pre-083 row shape and must not block a revocation.
  getHostSubscriptionMock.mockResolvedValue(null);
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY = "price_pro_monthly";
  stripeCustomersRetrieve.mockResolvedValue({
    deleted: false,
    metadata: { clerkUserId: "user_paid" },
  });
});

function subscriptionEvent(type: string, status: string) {
  return {
    type,
    data: {
      object: {
        id: "sub_1",
        status,
        customer: "cus_1",
        metadata: { clerkUserId: "user_paid" },
        items: { data: [{ price: { id: "price_pro_monthly" } }] },
      },
    },
  } as never;
}

describe("stripe subscription sync writes the Clerk-keyed authority", () => {
  it("records the tier against the Clerk user, even with no host profile yet", async () => {
    const result = await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.created", "active"),
    );

    expect(result.tier).toBe("professional");
    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: "user_paid",
        tier: "professional",
        billingStatus: "active",
        stripeSubscriptionId: "sub_1",
      }),
    );
  });

  it("writes the authority BEFORE the denormalized host_profiles copy", async () => {
    const order: string[] = [];
    upsertHostSubscriptionMock.mockImplementation(async () => {
      order.push("host_subscriptions");
    });
    hostProfilesUpdate.mockImplementation(() => {
      order.push("host_profiles");
    });

    await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.updated", "active"),
    );

    expect(order).toEqual(["host_subscriptions", "host_profiles"]);
  });

  it("keeps the denormalized copy in step", async () => {
    await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.updated", "active"),
    );

    expect(hostProfilesUpdate).toHaveBeenCalledWith({
      subscription_tier: "professional",
    });
  });

  it("records a cancellation as tier none — entitlements end with the plan", async () => {
    const result = await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.deleted", "canceled"),
    );

    expect(result.tier).toBe("none");
    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "none", billingStatus: "cancelled" }),
    );
  });

  it("records an unpaid subscription as tier none", async () => {
    // resolveSubscriptionTier already collapses every status outside
    // active/trialing/past_due to 'none'; the stored billing_status keeps the
    // detail for support without ever widening the entitlement.
    const result = await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.updated", "unpaid"),
    );

    expect(result.tier).toBe("none");
    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "none", billingStatus: "unpaid" }),
    );
  });

  // ── The zero-row match, by whether a profile EXISTS ───────────────────────
  //
  // A host_profiles UPDATE that matches nothing means two completely different
  // things, and this used to be decided by the DIRECTION of the entitlement:
  // raise on a grant, resolve on a revocation. That reading was right for the
  // case it was written for and became fatal the moment 083 landed, because 083
  // makes a profile IMPOSSIBLE at payment time — so every new paying customer
  // met the raise, every first webhook of every subscription answered 500, and
  // sustained 5xx is how Stripe disables an endpoint, which would then have
  // broken the revocations too.
  //
  // The question that actually separates them is whether there is a row to
  // write. No row: nothing is lost — host_subscriptions holds the entitlement
  // and create_my_host_profile seeds the copy from it — so resolve. A row that
  // the write did not touch: the copy is stale and nothing repairs it, so throw
  // and let Stripe redeliver.

  it("RESOLVES a cancellation that matched zero host_profiles rows", async () => {
    hostProfilesResult.current = { data: [], error: null };

    await expect(
      handleStripeWebhookEvent(
        subscriptionEvent("customer.subscription.deleted", "canceled"),
      ),
    ).resolves.toEqual(expect.objectContaining({ tier: "none" }));

    // …and the authority still recorded the revocation.
    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "none", billingStatus: "cancelled" }),
    );
  });

  it("RESOLVES a downgrade to none that matched zero host_profiles rows", async () => {
    hostProfilesResult.current = { data: null, error: null };

    await expect(
      handleStripeWebhookEvent(
        subscriptionEvent("customer.subscription.updated", "unpaid"),
      ),
    ).resolves.toEqual(expect.objectContaining({ tier: "none" }));
  });

  /**
   * The funnel 083 created: sign up, pay, THEN create the profile. This is the
   * first webhook every paying customer produces, and it must be a 2xx.
   */
  it("RESOLVES a GRANT for a customer who has not created their profile yet", async () => {
    hostProfilesResult.current = { data: [], error: null };
    hostProfilesProbe.current = { data: [], error: null };

    await expect(
      handleStripeWebhookEvent(
        subscriptionEvent("customer.subscription.created", "active"),
      ),
    ).resolves.toEqual(expect.objectContaining({ tier: "professional" }));

    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "professional" }),
    );
  });

  it("still THROWS when a profile EXISTS and the write changed nothing", async () => {
    hostProfilesResult.current = { data: [], error: null };
    hostProfilesProbe.current = { data: [{ id: "host-1" }], error: null };

    await expect(
      handleStripeWebhookEvent(
        subscriptionEvent("customer.subscription.created", "active"),
      ),
    ).rejects.toThrow(/a host_profiles row exists but the tier update changed nothing/i);
  });

  /** The same fault on a REVOCATION is a fault too — direction is not the test. */
  it("THROWS on a revocation that left an existing profile untouched", async () => {
    hostProfilesResult.current = { data: [], error: null };
    hostProfilesProbe.current = { data: [{ id: "host-1" }], error: null };

    await expect(
      handleStripeWebhookEvent(
        subscriptionEvent("customer.subscription.deleted", "canceled"),
      ),
    ).rejects.toThrow(/a host_profiles row exists but the tier update changed nothing/i);
  });

  it("never calls a revocation's payer 'paying' — nobody paid on that path", async () => {
    hostProfilesResult.current = { data: [], error: null };
    hostProfilesProbe.current = { data: [{ id: "host-1" }], error: null };

    await expect(
      handleStripeWebhookEvent(
        subscriptionEvent("customer.subscription.created", "active"),
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("paying"),
      }) as Error,
    );
  });

  it("surfaces a real database error in EITHER direction", async () => {
    hostProfilesResult.current = { data: null, error: { message: "permission denied" } };

    await expect(
      handleStripeWebhookEvent(
        subscriptionEvent("customer.subscription.deleted", "canceled"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("writes NOTHING when the event carries no resolvable Clerk user", async () => {
    stripeCustomersRetrieve.mockResolvedValue({ deleted: false, metadata: {} });

    const result = await handleStripeWebhookEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_2",
          status: "active",
          customer: "cus_2",
          metadata: {},
          items: { data: [{ price: { id: "price_pro_monthly" } }] },
        },
      },
    } as never);

    expect(result.action).toBe("ignored_missing_clerk_user");
    expect(upsertHostSubscriptionMock).not.toHaveBeenCalled();
  });

  it("grants nothing on a completed-but-unpaid checkout session", async () => {
    const result = await handleStripeWebhookEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          payment_status: "unpaid",
          customer: "cus_1",
          metadata: { clerkUserId: "user_paid", subscriptionTier: "professional" },
        },
      },
    } as never);

    expect(result.action).toBe("deferred_unpaid_checkout");
    expect(upsertHostSubscriptionMock).not.toHaveBeenCalled();
  });

  it("records the tier once a checkout session is genuinely paid", async () => {
    const result = await handleStripeWebhookEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_2",
          mode: "subscription",
          payment_status: "paid",
          customer: "cus_1",
          subscription: "sub_9",
          metadata: { clerkUserId: "user_paid", subscriptionTier: "professional" },
        },
      },
    } as never);

    expect(result.action).toBe("synced_checkout_session");
    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: "user_paid",
        tier: "professional",
        stripeSubscriptionId: "sub_9",
      }),
    );
  });
});

// ── A cancellation must name the subscription the entitlement came from ─────

/**
 * customer.subscription.deleted used to revoke on sight. It never asked WHICH
 * subscription the recorded entitlement belonged to, so a cancellation could
 * take away an entitlement granted by a different, still-billing subscription.
 *
 * Two concurrent subscriptions are not hypothetical: the already-subscribed
 * guard on checkout used to fail open, and the upsert overwrites
 * stripe_subscription_id — so the older one billed on with nothing pointing at
 * it, and cancelling the older one would have revoked the newer one's plan.
 */
describe("a revocation is checked against the recorded subscription id", () => {
  it("REFUSES to revoke when the cancelled subscription is not the recorded one", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "professional",
      billingStatus: "active",
      currentPeriodEnd: null,
      stripeSubscriptionId: "sub_current",
    });

    const result = await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.deleted", "canceled"),
    );

    expect(result.action).toBe("ignored_stale_subscription_revocation");
    expect(result.tier).toBeNull();
    expect(upsertHostSubscriptionMock).not.toHaveBeenCalled();
    expect(hostProfilesUpdate).not.toHaveBeenCalled();
  });

  it("revokes when the cancelled subscription IS the recorded one", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "professional",
      billingStatus: "active",
      currentPeriodEnd: null,
      stripeSubscriptionId: "sub_1",
    });

    const result = await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.deleted", "canceled"),
    );

    expect(result.tier).toBe("none");
    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "none" }),
    );
  });

  /**
   * A row with no id recorded is a row written before the id was captured. That
   * is not evidence the event is stale, so it still revokes — refusing would
   * leave a cancelled host entitled forever.
   */
  it("revokes when the database recorded no subscription id at all", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "starter",
      billingStatus: "active",
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
    });

    const result = await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.deleted", "canceled"),
    );

    expect(result.tier).toBe("none");
  });

  /** The same check covers a status-driven collapse to none, not just delete. */
  it("REFUSES a stale non-payment downgrade too", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "professional",
      billingStatus: "active",
      currentPeriodEnd: null,
      stripeSubscriptionId: "sub_current",
    });

    const result = await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.updated", "unpaid"),
    );

    expect(result.action).toBe("ignored_stale_subscription_revocation");
    expect(upsertHostSubscriptionMock).not.toHaveBeenCalled();
  });

  /**
   * GRANTS are deliberately NOT checked. Re-subscribing looks exactly like a
   * mismatch — new subscription, old id still on the row — and refusing it would
   * leave a paying host unentitled.
   */
  it("does NOT check the id on a grant, so re-subscribing works", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "none",
      billingStatus: "cancelled",
      currentPeriodEnd: null,
      stripeSubscriptionId: "sub_old",
    });

    const result = await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.created", "active"),
    );

    expect(result.tier).toBe("professional");
    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "professional", stripeSubscriptionId: "sub_1" }),
    );
  });

  /**
   * The read throws on failure and is deliberately not caught: an authority that
   * cannot be consulted must not become a revocation. Stripe redelivers.
   */
  it("does not revoke when the recorded subscription cannot be read", async () => {
    getHostSubscriptionMock.mockRejectedValue(new Error("connection reset"));

    await expect(
      handleStripeWebhookEvent(
        subscriptionEvent("customer.subscription.deleted", "canceled"),
      ),
    ).rejects.toThrow(/connection reset/);

    expect(upsertHostSubscriptionMock).not.toHaveBeenCalled();
  });
});

// ── The lapse sweep runs on every PLAN state write ──────────────────────────

/**
 * 083's trigger fires on a write to `listings`. A host whose plan lapses writes
 * nothing, so nothing else in the system ever takes their listings down — the
 * "downgrade and keep everything live" bypass. The sweep is the only thing that
 * runs when the SUBSCRIPTION changes.
 *
 * SCOPE. This covers the PLAN term of the allowance only. The ADD-ON term
 * (host_profiles.purchased_listing_slots) never reaches this function — the
 * add-on branch of syncSubscriptionEvent returns first — and is swept inside
 * migration 085's credit / revoke / sync functions, which are its only writers.
 * That half is proved against a real database in
 * tools/db-assert/sql/assert_listing_allowance_enforcement.sql, section 5.
 */
describe("listings are brought back inside the allowance", () => {
  it("sweeps after a cancellation", async () => {
    await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.deleted", "canceled"),
    );

    expect(closeListingsMock).toHaveBeenCalledWith("user_paid");
  });

  it("sweeps after a downgrade that is not a cancellation", async () => {
    await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.updated", "unpaid"),
    );

    expect(closeListingsMock).toHaveBeenCalledWith("user_paid");
  });

  it("sweeps after a paid checkout too — a no-op, and free of a special case", async () => {
    await handleStripeWebhookEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_3",
          mode: "subscription",
          payment_status: "paid",
          customer: "cus_1",
          subscription: "sub_9",
          metadata: { clerkUserId: "user_paid", subscriptionTier: "professional" },
        },
      },
    } as never);

    expect(closeListingsMock).toHaveBeenCalledWith("user_paid");
  });

  /**
   * Ordering, and it is load-bearing: the zero-row resolution still throws when
   * a profile exists and the write changed nothing, and a sweep placed after it
   * would be skipped by that throw on exactly the accounts whose state is least
   * trustworthy.
   */
  it("runs BEFORE the zero-row resolution can throw", async () => {
    hostProfilesResult.current = { data: [], error: null };
    hostProfilesProbe.current = { data: [{ id: "host-1" }], error: null };

    await expect(
      handleStripeWebhookEvent(
        subscriptionEvent("customer.subscription.created", "active"),
      ),
    ).rejects.toThrow(/a host_profiles row exists but the tier update changed nothing/i);

    expect(closeListingsMock).toHaveBeenCalledWith("user_paid");
  });

  it("does NOT sweep when the revocation was refused as stale", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "professional",
      billingStatus: "active",
      currentPeriodEnd: null,
      stripeSubscriptionId: "sub_current",
    });

    await handleStripeWebhookEvent(
      subscriptionEvent("customer.subscription.deleted", "canceled"),
    );

    expect(closeListingsMock).not.toHaveBeenCalled();
  });
});
