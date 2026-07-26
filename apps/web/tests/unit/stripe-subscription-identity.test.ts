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
const hostProfilesUpdate = vi.hoisted(() => vi.fn());
const stripeCustomersRetrieve = vi.hoisted(() => vi.fn());
const stripeCustomersUpdate = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@explore-and-earn/db", () => ({
  adminClient: () => ({
    from: () => ({
      update: (values: unknown) => {
        hostProfilesUpdate(values);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
  activateBoostCampaignFromCheckout: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  recordInvitePackPurchase: vi.fn(),
  upsertHostSubscription: upsertHostSubscriptionMock,
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
