import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A "subscription refund" must resolve a charge from the PLAN subscription —
 * never from the additional-listing add-on.
 *
 * The defect this pins (#283 review): the add-on bills as its own subscription
 * on the SAME Stripe customer, and its invoices carry the same subscription_*
 * billing reasons the charge lookup filters on. A customer-wide "latest
 * subscription charge" could therefore resolve to an ADD-ON invoice — the
 * refund would be recorded as a plan refund, and a full-charge approval would
 * cancel the plan over money the plan never collected. The authority row
 * (host_subscriptions) records which subscription the plan entitlement came
 * from, so the invoice search is scoped to it whenever it is recorded.
 */

const getHostSubscriptionMock = vi.hoisted(() => vi.fn());
const customersSearch = vi.hoisted(() => vi.fn());
const invoicesList = vi.hoisted(() => vi.fn());

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
  class FakeStripe {
    static errors = { StripeError: class extends Error {} };
    customers = { search: customersSearch, retrieve: vi.fn(), list: vi.fn(), update: vi.fn() };
    invoices = { list: invoicesList };
    subscriptions = { retrieve: vi.fn(), list: vi.fn(), cancel: vi.fn() };
  }
  return { default: FakeStripe };
});

process.env.STRIPE_SECRET_KEY ??= "sk_test_scoping";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_scoping";

const { findLatestHostSubscriptionCharge } = await import("../../services/stripe");

const paidPlanInvoice = {
  id: "in_plan",
  billing_reason: "subscription_cycle",
  amount_paid: 19900,
  created: 1_700_000_000,
  payments: {
    data: [{ status: "paid", payment: { payment_intent: "pi_plan" } }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  customersSearch.mockResolvedValue({ data: [{ id: "cus_1" }] });
  invoicesList.mockResolvedValue({ data: [paidPlanInvoice] });
});

describe("findLatestHostSubscriptionCharge scopes to the plan subscription", () => {
  it("passes the recorded plan subscription id to the invoice search", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "professional",
      billingStatus: "active",
      currentPeriodEnd: null,
      stripeSubscriptionId: "sub_plan",
    });

    const result = await findLatestHostSubscriptionCharge("user_host");

    expect(result.ok).toBe(true);
    expect(result.charge?.paymentIntentId).toBe("pi_plan");
    expect(invoicesList).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1", subscription: "sub_plan" }),
    );
  });

  it("stays unscoped only when no subscription id is on record", async () => {
    // A row with no recorded id cannot coexist with an add-on — the add-on
    // checkout requires a paid plan recorded under 083 — so the unscoped
    // fallback cannot select an add-on invoice.
    getHostSubscriptionMock.mockResolvedValue({
      tier: "starter",
      billingStatus: "active",
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
    });

    const result = await findLatestHostSubscriptionCharge("user_host");

    expect(result.ok).toBe(true);
    const params = invoicesList.mock.calls[0][0] as Record<string, unknown>;
    expect("subscription" in params).toBe(false);
  });

  it("REFUSES when the authority cannot be read — never widens the candidate set", async () => {
    getHostSubscriptionMock.mockRejectedValue(new Error("connection reset"));

    const result = await findLatestHostSubscriptionCharge("user_host");

    expect(result.ok).toBe(false);
    expect(invoicesList).not.toHaveBeenCalled();
  });
});
