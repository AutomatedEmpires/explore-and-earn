/**
 * A refund may never exceed what Stripe actually charged.
 *
 * The defect this pins: a subscription refund request recorded
 * stripePaymentIntentId = null and whatever amount the host typed into the
 * billing form, and nothing anywhere in the repo ever asked Stripe what the
 * subscription charge was. The host-facing form already promised "we'll verify
 * the exact charge in Stripe before issuing any refund" — nothing did.
 *
 * The rules live in services/stripe/refundVerification.ts and are imported here
 * rather than restated, so a regression in the shipped rule fails these tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  invoicePaymentIntentId,
  overRefundRefusal,
  refundableCents,
  refundedCents,
  selectLatestSubscriptionCharge,
} from "../../services/stripe/refundVerification";

/* ─── The pure rules ───────────────────────────────────────────────────────── */

describe("invoicePaymentIntentId", () => {
  it("reads the current shape: payments[].payment.payment_intent", () => {
    expect(
      invoicePaymentIntentId({
        payments: {
          data: [
            { status: "paid", payment: { type: "payment_intent", payment_intent: "pi_1" } },
          ],
        },
      }),
    ).toBe("pi_1");
  });

  it("reads the legacy shape: a top-level payment_intent", () => {
    expect(invoicePaymentIntentId({ payment_intent: "pi_legacy" })).toBe("pi_legacy");
    expect(invoicePaymentIntentId({ payment_intent: { id: "pi_expanded" } })).toBe(
      "pi_expanded",
    );
  });

  /** An invoice payment that did not collect anything is not a charge. */
  it("ignores invoice payments that are not paid", () => {
    expect(
      invoicePaymentIntentId({
        payments: {
          data: [
            { status: "canceled", payment: { payment_intent: "pi_dead" } },
            { status: "open", payment: { payment_intent: "pi_pending" } },
          ],
        },
      }),
    ).toBeNull();
  });

  it("returns null rather than guessing when nothing is present", () => {
    expect(invoicePaymentIntentId(null)).toBeNull();
    expect(invoicePaymentIntentId({})).toBeNull();
    expect(invoicePaymentIntentId({ payments: { data: [] } })).toBeNull();
  });
});

describe("selectLatestSubscriptionCharge", () => {
  const paid = (over: Record<string, unknown>) => ({
    id: "in_x",
    billing_reason: "subscription_cycle",
    amount_paid: 19900,
    created: 100,
    payments: { data: [{ status: "paid", payment: { payment_intent: "pi_x" } }] },
    ...over,
  });

  it("picks the newest subscription invoice with a real charge", () => {
    const charge = selectLatestSubscriptionCharge([
      paid({ id: "in_old", created: 100, payments: { data: [{ status: "paid", payment: { payment_intent: "pi_old" } }] } }),
      paid({ id: "in_new", created: 900, amount_paid: 39900, payments: { data: [{ status: "paid", payment: { payment_intent: "pi_new" } }] } }),
    ]);

    expect(charge).toEqual({
      invoiceId: "in_new",
      paymentIntentId: "pi_new",
      amountPaidCents: 39900,
      createdUnix: 900,
    });
  });

  /**
   * The negative control. Only subscription-attributed invoices count — a
   * one-off purchase must never become the charge a subscription refund is
   * issued against.
   */
  it("ignores invoices that are not raised by a subscription", () => {
    expect(selectLatestSubscriptionCharge([paid({ billing_reason: "manual" })])).toBeNull();
    expect(
      selectLatestSubscriptionCharge([paid({ billing_reason: "quote_accept" })]),
    ).toBeNull();
  });

  it("ignores invoices with nothing paid or no resolvable PaymentIntent", () => {
    expect(selectLatestSubscriptionCharge([paid({ amount_paid: 0 })])).toBeNull();
    expect(selectLatestSubscriptionCharge([paid({ payments: { data: [] } })])).toBeNull();
    expect(selectLatestSubscriptionCharge([])).toBeNull();
  });
});

describe("refundedCents / refundableCents", () => {
  it("counts refunds that are holding money back, including pending ones", () => {
    expect(
      refundedCents([
        { status: "succeeded", amount: 5000 },
        { status: "pending", amount: 1000 },
      ]),
    ).toBe(6000);
  });

  /** A canceled or failed refund gave nothing back, so it must not count. */
  it("ignores refunds that returned nothing", () => {
    expect(
      refundedCents([
        { status: "canceled", amount: 5000 },
        { status: "failed", amount: 5000 },
      ]),
    ).toBe(0);
  });

  it("never reports a negative refundable balance", () => {
    expect(refundableCents(20000, 5000)).toBe(15000);
    expect(refundableCents(20000, 25000)).toBe(0);
    expect(refundableCents(Number.NaN, Number.NaN)).toBe(0);
  });
});

describe("overRefundRefusal", () => {
  it("allows an amount within what Stripe still holds", () => {
    expect(overRefundRefusal(19900, 19900)).toBeNull();
    expect(overRefundRefusal(100, 19900)).toBeNull();
  });

  /** The whole defect: refusing, not clamping, an amount larger than the charge. */
  it("refuses more than was actually charged", () => {
    expect(overRefundRefusal(19901, 19900)).toMatch(/exceeds/i);
    expect(overRefundRefusal(500000, 19900)).toMatch(/exceeds/i);
  });

  it("refuses when there is nothing left to refund", () => {
    expect(overRefundRefusal(100, 0)).toMatch(/no refundable balance/i);
  });

  it("refuses a non-positive or fractional amount of cents", () => {
    expect(overRefundRefusal(0, 19900)).toMatch(/positive whole number/i);
    expect(overRefundRefusal(-1, 19900)).toMatch(/positive whole number/i);
    expect(overRefundRefusal(10.5, 19900)).toMatch(/positive whole number/i);
  });
});

/* ─── The wiring: the action must actually apply the rules ─────────────────── */

const authMock = vi.hoisted(() => vi.fn());
const isAdminUserIdMock = vi.hoisted(() => vi.fn());

const dbMocks = vi.hoisted(() => ({
  claimRefundForProcessing: vi.fn(),
  createRefundRequest: vi.fn(),
  getHostClerkUserIdByProfileId: vi.fn(),
  getHostProfile: vi.fn(),
  getHostRefundablePurchases: vi.fn(),
  getRefundRequestById: vi.fn(),
  markRefundResolved: vi.fn(),
  revokeRefundedPurchaseRow: vi.fn(),
}));

const stripeMocks = vi.hoisted(() => ({
  cancelHostSubscription: vi.fn(),
  findLatestHostSubscriptionCharge: vi.fn(),
  getRefundableChargeCents: vi.fn(),
  issueRefund: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/admin", () => ({ isAdminUserId: isAdminUserIdMock }));
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimitDistributed: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("../../lib/sentry", () => ({ reportError: vi.fn() }));
vi.mock("../../services/stripe", () => stripeMocks);

vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const { requestRefundAction, resolveRefundAction } = await import(
  "../../app/actions/refunds"
);

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "user_host", getToken: async () => "tok" });
  isAdminUserIdMock.mockReturnValue(true);
  dbMocks.getHostProfile.mockResolvedValue({ id: "host-1" });
  dbMocks.createRefundRequest.mockResolvedValue({ ok: true, id: REQUEST_ID });
  dbMocks.claimRefundForProcessing.mockResolvedValue({ ok: true });
  dbMocks.markRefundResolved.mockResolvedValue({ ok: true });
  dbMocks.revokeRefundedPurchaseRow.mockResolvedValue({ ok: true });
  stripeMocks.findLatestHostSubscriptionCharge.mockResolvedValue({
    ok: true,
    charge: {
      invoiceId: "in_1",
      paymentIntentId: "pi_sub_1",
      amountPaidCents: 19900,
      createdUnix: 900,
    },
  });
  stripeMocks.getRefundableChargeCents.mockResolvedValue({
    ok: true,
    refundableCents: 19900,
  });
  stripeMocks.issueRefund.mockResolvedValue({ ok: true, refundId: "re_1" });
});

describe("filing a subscription refund request", () => {
  it("records the REAL PaymentIntent Stripe charged, not null", async () => {
    await expect(
      requestRefundAction({ purchaseType: "subscription", amountCents: 19900 }),
    ).resolves.toEqual({ ok: true });

    expect(stripeMocks.findLatestHostSubscriptionCharge).toHaveBeenCalledWith("user_host");
    expect(dbMocks.createRefundRequest).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({
        purchaseType: "subscription",
        stripePaymentIntentId: "pi_sub_1",
        amountCents: 19900,
      }),
    );
  });

  /** The refusal: a host cannot type a number bigger than the invoice. */
  it("refuses an amount larger than the invoice actually collected", async () => {
    const result = await requestRefundAction({
      purchaseType: "subscription",
      amountCents: 99900,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds/i);
    expect(dbMocks.createRefundRequest).not.toHaveBeenCalled();
  });

  it("refuses when Stripe has no subscription charge on record", async () => {
    stripeMocks.findLatestHostSubscriptionCharge.mockResolvedValue({
      ok: false,
      error: "No paid subscription invoice found for this host.",
    });

    const result = await requestRefundAction({
      purchaseType: "subscription",
      amountCents: 19900,
    });

    expect(result.ok).toBe(false);
    expect(dbMocks.createRefundRequest).not.toHaveBeenCalled();
  });
});

describe("approving a refund verifies the charge first", () => {
  beforeEach(() => {
    dbMocks.getRefundRequestById.mockResolvedValue({
      id: REQUEST_ID,
      hostProfileId: "host-1",
      purchaseType: "subscription",
      referenceId: null,
      stripePaymentIntentId: null,
      amountCents: 99900,
      status: "requested",
    });
    dbMocks.getHostClerkUserIdByProfileId.mockResolvedValue("user_host");
    stripeMocks.cancelHostSubscription.mockResolvedValue({ ok: true, cancelled: true });
  });

  /**
   * A row filed before the lookup existed still carries a null PaymentIntent and
   * a host-typed amount. Approving it must resolve the real charge and refuse.
   */
  it("refuses to pay out more than Stripe still holds, without claiming the row", async () => {
    const result = await resolveRefundAction(REQUEST_ID, "approve");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds/i);
    expect(stripeMocks.issueRefund).not.toHaveBeenCalled();
    expect(dbMocks.claimRefundForProcessing).not.toHaveBeenCalled();
  });

  it("resolves the missing PaymentIntent from Stripe and refunds a valid amount", async () => {
    dbMocks.getRefundRequestById.mockResolvedValue({
      id: REQUEST_ID,
      hostProfileId: "host-1",
      purchaseType: "subscription",
      referenceId: null,
      stripePaymentIntentId: null,
      amountCents: 19900,
      status: "requested",
    });

    await expect(resolveRefundAction(REQUEST_ID, "approve")).resolves.toEqual({
      ok: true,
    });

    expect(stripeMocks.getRefundableChargeCents).toHaveBeenCalledWith("pi_sub_1");
    expect(stripeMocks.issueRefund).toHaveBeenCalledWith(
      "pi_sub_1",
      19900,
      expect.stringContaining(REQUEST_ID),
    );
  });

  /** An unverifiable charge must not be refunded on trust. */
  it("refuses when the charge cannot be verified in Stripe", async () => {
    dbMocks.getRefundRequestById.mockResolvedValue({
      id: REQUEST_ID,
      hostProfileId: "host-1",
      purchaseType: "boost",
      referenceId: "campaign-1",
      stripePaymentIntentId: "pi_boost_1",
      amountCents: 20000,
      status: "requested",
    });
    stripeMocks.getRefundableChargeCents.mockResolvedValue({
      ok: false,
      error: "Stripe charge lookup failed.",
    });

    const result = await resolveRefundAction(REQUEST_ID, "approve");

    expect(result.ok).toBe(false);
    expect(stripeMocks.issueRefund).not.toHaveBeenCalled();
  });
});
