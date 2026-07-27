import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The checkout RETURN path confirms the session with Stripe and applies the
 * grant itself, instead of hoping the webhook won the race.
 *
 * Stripe does not guarantee the entitlement webhook lands before the browser
 * follows success_url, and the old success_url pointed into the (host) group —
 * so a brand-new PAYING host could be bounced back to plan selection seconds
 * after paying. confirmCheckoutSessionForUser closes that race: it retrieves
 * the session BY ID (authentic payload — the URL contributes only the lookup
 * key), refuses sessions that belong to someone else, defers unpaid
 * delayed-notification payments exactly as the webhook does, and otherwise
 * runs the SAME idempotent grant path the webhook runs.
 */

const upsertHostSubscriptionMock = vi.hoisted(() => vi.fn());
const closeListingsMock = vi.hoisted(() => vi.fn());
const sessionsRetrieve = vi.hoisted(() => vi.fn());
const customersRetrieve = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@explore-and-earn/db", () => ({
  adminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.update = () => chain;
      chain.eq = () => chain;
      chain.limit = () => chain;
      chain.select = () => chain;
      chain.then = (onFulfilled: unknown, onRejected: unknown) =>
        Promise.resolve({ data: [{ id: "host-1" }], error: null }).then(
          onFulfilled as never,
          onRejected as never,
        );
      return chain;
    },
  }),
  activateBoostCampaignFromCheckout: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  recordInvitePackPurchase: vi.fn(),
  revokeListingSlotPurchase: vi.fn(),
  creditListingSlotPurchase: vi.fn(),
  syncListingSlotSubscription: vi.fn(),
  upsertHostSubscription: upsertHostSubscriptionMock,
  closeHostListingsOverAllowance: closeListingsMock,
  getHostSubscriptionByClerkUserId: vi.fn(),
}));

vi.mock("stripe", () => {
  class FakeStripe {
    static errors = { StripeError: class extends Error {} };
    checkout = { sessions: { retrieve: sessionsRetrieve, create: vi.fn() } };
    customers = {
      retrieve: customersRetrieve,
      update: vi.fn(),
      list: vi.fn(),
      search: vi.fn(),
    };
    subscriptions = { retrieve: vi.fn(), list: vi.fn(), cancel: vi.fn() };
  }
  return { default: FakeStripe };
});

process.env.STRIPE_SECRET_KEY ??= "sk_test_return";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_return";

const { confirmCheckoutSessionForUser } = await import("../../services/stripe");

function paidPlanSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_return_1",
    mode: "subscription",
    payment_status: "paid",
    customer: "cus_1",
    subscription: "sub_9",
    client_reference_id: "user_payer",
    metadata: { clerkUserId: "user_payer", subscriptionTier: "professional" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  closeListingsMock.mockResolvedValue(0);
  customersRetrieve.mockResolvedValue({
    deleted: false,
    metadata: { clerkUserId: "user_payer" },
  });
  sessionsRetrieve.mockResolvedValue(paidPlanSession());
});

describe("confirmCheckoutSessionForUser", () => {
  it("GRANTS a paid plan session through the same path the webhook uses", async () => {
    const result = await confirmCheckoutSessionForUser("cs_return_1", "user_payer");

    expect(result.outcome).toBe("granted");
    expect(sessionsRetrieve).toHaveBeenCalledWith("cs_return_1");
    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: "user_payer",
        tier: "professional",
        stripeSubscriptionId: "sub_9",
      }),
    );
  });

  it("REFUSES a session that belongs to someone else, and grants nothing", async () => {
    const result = await confirmCheckoutSessionForUser("cs_return_1", "user_other");

    expect(result.outcome).toBe("not_yours");
    expect(upsertHostSubscriptionMock).not.toHaveBeenCalled();
  });

  it("defers a delayed-notification payment exactly as the webhook does", async () => {
    sessionsRetrieve.mockResolvedValue(
      paidPlanSession({ payment_status: "unpaid" }),
    );

    const result = await confirmCheckoutSessionForUser("cs_return_1", "user_payer");

    expect(result.outcome).toBe("pending_payment");
    expect(upsertHostSubscriptionMock).not.toHaveBeenCalled();
  });

  it("honours a 100% coupon — no_payment_required is a paid state", async () => {
    sessionsRetrieve.mockResolvedValue(
      paidPlanSession({ payment_status: "no_payment_required" }),
    );

    const result = await confirmCheckoutSessionForUser("cs_return_1", "user_payer");

    expect(result.outcome).toBe("granted");
  });

  it("reports a failed session read WITHOUT implying the payment was lost", async () => {
    sessionsRetrieve.mockRejectedValue(new Error("stripe unreachable"));

    const result = await confirmCheckoutSessionForUser("cs_return_1", "user_payer");

    // The webhook remains the safety net; the caller renders "in progress".
    expect(result.outcome).toBe("failed");
    expect(upsertHostSubscriptionMock).not.toHaveBeenCalled();
  });

  it("reports a paid session it cannot map as failed rather than granted", async () => {
    sessionsRetrieve.mockResolvedValue(
      paidPlanSession({ metadata: { clerkUserId: "user_payer" } }),
    );

    const result = await confirmCheckoutSessionForUser("cs_return_1", "user_payer");

    // No subscriptionTier in metadata -> the grant path ignores it; saying
    // "granted" would send the payer into onboarding to be refused.
    expect(result.outcome).toBe("failed");
  });

  it("survives a grant fault by reporting failed, so the webhook can finish it", async () => {
    upsertHostSubscriptionMock.mockRejectedValue(new Error("db down"));

    const result = await confirmCheckoutSessionForUser("cs_return_1", "user_payer");

    expect(result.outcome).toBe("failed");
  });
});
