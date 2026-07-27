import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An approved FULL PLAN refund cancels the PLAN — exactly the plan, by its
 * recorded id, and nothing else.
 *
 * Two defects are pinned here (#283 review + its adversarial follow-up):
 *
 *  1. cancelHostSubscription listed every active subscription on the customer
 *     and cancelled them all. The additional-listing add-on bills as its OWN
 *     subscription on the SAME customer, so approving a plan refund also
 *     cancelled a product the host had separately paid for — unrefunded.
 *     Decision, stated so nobody re-litigates it in a hurry: the add-on is
 *     LEFT INTACT. It keeps delivering the slots it bills for, the host can
 *     end it in the billing portal, and an admin can refund it as its own
 *     decision.
 *
 *  2. The first fix filtered a customer listing by productType metadata — but
 *     Stripe lists are newest-first and truncatable, so a host holding enough
 *     add-on subscriptions pushed the plan off the page: nothing cancelled,
 *     success reported, plan still billing after the refund went out. The
 *     plan is therefore cancelled BY ITS RECORDED ID from host_subscriptions
 *     (only the plan path ever writes stripe_subscription_id), and the
 *     customer listing is only a fallback for a pre-083 row with no id.
 */

const getHostSubscriptionMock = vi.hoisted(() => vi.fn());
const customersSearch = vi.hoisted(() => vi.fn());
const subscriptionsList = vi.hoisted(() => vi.fn());
const subscriptionsCancel = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@explore-and-earn/db", () => ({
  adminClient: vi.fn(),
  activateBoostCampaignFromCheckout: vi.fn(),
  closeHostListingsOverAllowance: vi.fn(),
  creditListingSlotPurchase: vi.fn(),
  getHostSubscriptionByClerkUserId: getHostSubscriptionMock,
  insertHostAnnouncement: vi.fn(),
  recordInvitePackPurchase: vi.fn(),
  revokeListingSlotPurchase: vi.fn(),
  syncListingSlotSubscription: vi.fn(),
  upsertHostSubscription: vi.fn(),
}));

vi.mock("stripe", () => {
  class StripeError extends Error {}
  class StripeInvalidRequestError extends StripeError {}
  class FakeStripe {
    static errors = { StripeError, StripeInvalidRequestError };
    customers = { search: customersSearch, retrieve: vi.fn(), list: vi.fn(), update: vi.fn() };
    subscriptions = { list: subscriptionsList, cancel: subscriptionsCancel, retrieve: vi.fn() };
  }
  return { default: FakeStripe };
});

process.env.STRIPE_SECRET_KEY ??= "sk_test_cancel";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_cancel";

const stripeModule = await import("stripe");
const StripeMock = stripeModule.default as unknown as {
  errors: {
    StripeError: new (message?: string) => Error;
    StripeInvalidRequestError: new (message?: string) => Error;
  };
};
const { ADDITIONAL_LISTING_PRODUCT_TYPE, cancelHostSubscription } = await import(
  "../../services/stripe"
);

function recordedPlan(stripeSubscriptionId: string | null) {
  return {
    tier: "professional",
    billingStatus: "active",
    currentPeriodEnd: null,
    stripeSubscriptionId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getHostSubscriptionMock.mockResolvedValue(recordedPlan("sub_plan"));
  customersSearch.mockResolvedValue({ data: [{ id: "cus_1" }] });
  subscriptionsList.mockResolvedValue({ data: [] });
  subscriptionsCancel.mockResolvedValue({ id: "cancelled" });
});

describe("cancelHostSubscription cancels the plan by its recorded id", () => {
  it("cancels exactly the recorded plan subscription and never lists", async () => {
    const result = await cancelHostSubscription("user_1");

    expect(result).toEqual({ ok: true, cancelled: true });
    expect(subscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_plan");
    // No listing means no page-truncation blind spot: a host with any number
    // of add-on subscriptions cannot push the plan out of reach.
    expect(subscriptionsList).not.toHaveBeenCalled();
  });

  it("treats an already-cancelled plan as nothing-to-do, not a failure", async () => {
    subscriptionsCancel.mockRejectedValue(
      new StripeMock.errors.StripeInvalidRequestError(
        "This subscription has been canceled",
      ),
    );

    const result = await cancelHostSubscription("user_1");

    expect(result).toEqual({ ok: true, cancelled: false });
  });

  it("does NOT claim success when the cancel fails for any other reason", async () => {
    subscriptionsCancel.mockRejectedValue(
      new StripeMock.errors.StripeError("connection reset"),
    );

    const result = await cancelHostSubscription("user_1");

    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(false);
  });

  it("REFUSES when the authority cannot be read — unreadable is not 'nothing to cancel'", async () => {
    getHostSubscriptionMock.mockRejectedValue(new Error("connection reset"));

    const result = await cancelHostSubscription("user_1");

    expect(result.ok).toBe(false);
    expect(subscriptionsCancel).not.toHaveBeenCalled();
  });
});

describe("the no-recorded-id fallback still spares the add-on", () => {
  beforeEach(() => {
    getHostSubscriptionMock.mockResolvedValue(recordedPlan(null));
  });

  it("lists ALL statuses and cancels only unstamped, non-terminal subscriptions", async () => {
    subscriptionsList.mockResolvedValue({
      data: [
        { id: "sub_plan_lapsed", status: "unpaid", metadata: {} },
        {
          id: "sub_addon",
          status: "active",
          metadata: { productType: ADDITIONAL_LISTING_PRODUCT_TYPE },
        },
        { id: "sub_dead", status: "canceled", metadata: {} },
      ],
    });

    const result = await cancelHostSubscription("user_1");

    expect(result).toEqual({ ok: true, cancelled: true });
    expect(subscriptionsList).toHaveBeenCalledWith(
      expect.objectContaining({ status: "all", limit: 100 }),
    );
    expect(subscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_plan_lapsed");
  });

  it("spares ANY productType-stamped subscription, not just today's add-on", async () => {
    subscriptionsList.mockResolvedValue({
      data: [
        { id: "sub_plan", status: "active", metadata: {} },
        { id: "sub_future", status: "active", metadata: { productType: "some_future_product" } },
      ],
    });

    await cancelHostSubscription("user_1");

    expect(subscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_plan");
  });

  it("reports nothing-to-do when only stamped subscriptions remain", async () => {
    subscriptionsList.mockResolvedValue({
      data: [
        {
          id: "sub_addon",
          status: "active",
          metadata: { productType: ADDITIONAL_LISTING_PRODUCT_TYPE },
        },
      ],
    });

    const result = await cancelHostSubscription("user_1");

    expect(result).toEqual({ ok: true, cancelled: false });
    expect(subscriptionsCancel).not.toHaveBeenCalled();
  });

  it("reports nothing-to-do for a customer with no subscriptions at all", async () => {
    const result = await cancelHostSubscription("user_1");

    expect(result).toEqual({ ok: true, cancelled: false });
    expect(subscriptionsCancel).not.toHaveBeenCalled();
  });
});
