/**
 * Two defects on the approve path, both about believing the wrong thing.
 *
 * 1. AN AMBIGUOUS STRIPE FAILURE WAS READ AS "NOTHING HAPPENED".
 *    `refunds.create` can fail on a request Stripe already committed — a
 *    timeout, a dropped connection, a 5xx after the write. The action recorded
 *    'failed' and returned before revokeRefundedPurchase, so the money left and
 *    the entitlement stayed: the boost ran to its ends_at, the announcement
 *    stayed in the feed. Exactly the loss the revocation step was added to stop,
 *    reached through the failure branch instead.
 *
 * 2. A PARTIAL SUBSCRIPTION REFUND CANCELLED THE WHOLE PLAN.
 *    revokeRefundedPurchase called cancelHostSubscription on any approved
 *    subscription refund, so a $1 goodwill refund against a $199 charge took the
 *    entire plan away and the host was left having paid $198 for nothing.
 *
 * The assertions are about what the action DOES with money and entitlements, not
 * about which helper it called: each case pins a revoke that must happen or must
 * not happen, and the recorded status that goes with it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const isAdminUserIdMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

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

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/admin", () => ({ isAdminUserId: isAdminUserIdMock }));
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimitDistributed: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../services/stripe", () => stripeMocks);

vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const { resolveRefundAction, requestRefundAction } = await import(
  "../../app/actions/refunds"
);
const { refundExhaustsCharge, refundLandedDespiteError } = await import(
  "../../services/stripe/refundVerification"
);

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const CHARGE_CENTS = 19900;

const BOOST_REQUEST = {
  id: REQUEST_ID,
  hostProfileId: "host-1",
  purchaseType: "boost" as const,
  referenceId: "campaign-1",
  stripePaymentIntentId: "pi_boost_1",
  amountCents: 20000,
  status: "requested" as const,
};

const SUBSCRIPTION_REQUEST = {
  id: REQUEST_ID,
  hostProfileId: "host-1",
  purchaseType: "subscription" as const,
  referenceId: null,
  stripePaymentIntentId: "pi_sub_1",
  amountCents: CHARGE_CENTS,
  status: "requested" as const,
};

/** The status markRefundResolved was asked to write. */
function recordedStatus(): string | undefined {
  const call = dbMocks.markRefundResolved.mock.calls.at(-1);
  return call?.[1]?.status as string | undefined;
}

/** The admin note markRefundResolved was asked to write. */
function recordedNote(): string | null | undefined {
  const call = dbMocks.markRefundResolved.mock.calls.at(-1);
  return call?.[1]?.adminNote as string | null | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();

  authMock.mockResolvedValue({ userId: "user_admin", getToken: async () => "tok" });
  isAdminUserIdMock.mockReturnValue(true);

  dbMocks.getRefundRequestById.mockResolvedValue({ ...BOOST_REQUEST });
  dbMocks.claimRefundForProcessing.mockResolvedValue({ ok: true });
  dbMocks.markRefundResolved.mockResolvedValue({ ok: true });
  dbMocks.revokeRefundedPurchaseRow.mockResolvedValue({ ok: true });
  dbMocks.getHostClerkUserIdByProfileId.mockResolvedValue("user_host");

  stripeMocks.cancelHostSubscription.mockResolvedValue({ ok: true, cancelled: true });
  stripeMocks.getRefundableChargeCents.mockResolvedValue({
    ok: true,
    refundableCents: 20000,
  });
  stripeMocks.issueRefund.mockResolvedValue({ ok: true, refundId: "re_1" });
});

describe("an ambiguous Stripe failure", () => {
  /**
   * The response was lost, not the money. Stripe now says it holds nothing
   * refundable on the charge, which can only mean the refund landed.
   */
  it("revokes the purchase when the charge shows the refund landed", async () => {
    stripeMocks.issueRefund.mockResolvedValue({
      ok: false,
      error: "Request timed out.",
    });
    stripeMocks.getRefundableChargeCents
      .mockResolvedValueOnce({ ok: true, refundableCents: 20000 })
      .mockResolvedValueOnce({ ok: true, refundableCents: 0 });

    await resolveRefundAction(REQUEST_ID, "approve");

    // The entitlement is taken back — this is the assertion that fails if the
    // failure branch returns before revocation again.
    expect(dbMocks.revokeRefundedPurchaseRow).toHaveBeenCalledWith(
      "test-service-key",
      "boost",
      "campaign-1",
    );
    expect(recordedStatus()).toBe("refunded");
    expect(recordedNote()).toMatch(/refund landed/i);
  });

  /** A real failure: Stripe still holds everything, so nothing may be revoked. */
  it("revokes NOTHING when the charge shows no refund landed", async () => {
    stripeMocks.issueRefund.mockResolvedValue({
      ok: false,
      error: "card_error",
    });
    stripeMocks.getRefundableChargeCents
      .mockResolvedValueOnce({ ok: true, refundableCents: 20000 })
      .mockResolvedValueOnce({ ok: true, refundableCents: 20000 });

    const result = await resolveRefundAction(REQUEST_ID, "approve");

    expect(dbMocks.revokeRefundedPurchaseRow).not.toHaveBeenCalled();
    expect(recordedStatus()).toBe("failed");
    expect(result.ok).toBe(false);
  });

  /**
   * "We could not tell" is not "it did not happen". Nothing is revoked on a
   * guess, but the row must say the outcome is unverified so it gets
   * reconciled rather than filed as a clean failure.
   */
  it("records the outcome as UNKNOWN when the charge cannot be re-read", async () => {
    stripeMocks.issueRefund.mockResolvedValue({ ok: false, error: "socket hang up" });
    stripeMocks.getRefundableChargeCents
      .mockResolvedValueOnce({ ok: true, refundableCents: 20000 })
      .mockResolvedValueOnce({ ok: false, error: "Stripe unreachable" });

    const result = await resolveRefundAction(REQUEST_ID, "approve");

    expect(dbMocks.revokeRefundedPurchaseRow).not.toHaveBeenCalled();
    expect(recordedStatus()).toBe("failed");
    expect(recordedNote()).toMatch(/UNKNOWN/);
    expect(result.error).toMatch(/UNKNOWN/);
  });

  it("does not re-read the charge when the refund plainly succeeded", async () => {
    await resolveRefundAction(REQUEST_ID, "approve");

    // One read: the pre-flight over-refund check. No second guess needed.
    expect(stripeMocks.getRefundableChargeCents).toHaveBeenCalledTimes(1);
    expect(recordedStatus()).toBe("refunded");
    expect(recordedNote()).toBeNull();
  });
});

describe("revocation is proportional to what was refunded", () => {
  beforeEach(() => {
    dbMocks.getRefundRequestById.mockResolvedValue({
      ...SUBSCRIPTION_REQUEST,
      amountCents: 100,
    });
    stripeMocks.getRefundableChargeCents.mockResolvedValue({
      ok: true,
      refundableCents: CHARGE_CENTS,
    });
  });

  it("does NOT cancel the plan for a $1 refund on a $199 charge", async () => {
    await expect(resolveRefundAction(REQUEST_ID, "approve")).resolves.toEqual({
      ok: true,
    });

    expect(stripeMocks.issueRefund).toHaveBeenCalledWith(
      "pi_sub_1",
      100,
      expect.any(String),
    );
    expect(stripeMocks.cancelHostSubscription).not.toHaveBeenCalled();
    expect(recordedStatus()).toBe("refunded");
  });

  it("cancels the plan when the whole charge is handed back", async () => {
    dbMocks.getRefundRequestById.mockResolvedValue({ ...SUBSCRIPTION_REQUEST });

    await expect(resolveRefundAction(REQUEST_ID, "approve")).resolves.toEqual({
      ok: true,
    });

    expect(stripeMocks.cancelHostSubscription).toHaveBeenCalledWith("user_host");
  });

  /**
   * A second partial refund that exhausts what Stripe still held IS a full
   * refund of the charge, and must cancel.
   */
  it("cancels when a later partial refund exhausts the remainder", async () => {
    dbMocks.getRefundRequestById.mockResolvedValue({
      ...SUBSCRIPTION_REQUEST,
      amountCents: 9900,
    });
    stripeMocks.getRefundableChargeCents.mockResolvedValue({
      ok: true,
      refundableCents: 9900, // 10000 already returned earlier
    });

    await resolveRefundAction(REQUEST_ID, "approve");

    expect(stripeMocks.cancelHostSubscription).toHaveBeenCalledWith("user_host");
  });

  /**
   * Negative control: proportionality is about SUBSCRIPTIONS. A boost or an
   * announcement has no fractional state — a partly refunded one still must not
   * keep running.
   */
  it("still revokes a partly refunded boost", async () => {
    dbMocks.getRefundRequestById.mockResolvedValue({
      ...BOOST_REQUEST,
      amountCents: 100,
    });
    stripeMocks.getRefundableChargeCents.mockResolvedValue({
      ok: true,
      refundableCents: 20000,
    });

    await resolveRefundAction(REQUEST_ID, "approve");

    expect(dbMocks.revokeRefundedPurchaseRow).toHaveBeenCalledWith(
      "test-service-key",
      "boost",
      "campaign-1",
    );
  });
});

describe("filing a second request against a refund already in flight", () => {
  beforeEach(() => {
    dbMocks.getHostProfile.mockResolvedValue({ id: "host-1" });
    dbMocks.createRefundRequest.mockResolvedValue({ ok: true, id: "new-row" });
  });

  /**
   * The picker hides it, but a server action is independently invocable, so the
   * annotation has to be enforced server-side too.
   */
  it("is refused, and writes no row", async () => {
    dbMocks.getHostRefundablePurchases.mockResolvedValue([
      {
        purchaseType: "boost",
        referenceId: "campaign-1",
        stripePaymentIntentId: "pi_boost_1",
        amountCents: 20000,
        label: "14-day listing boost",
        purchasedAt: "2026-07-01T00:00:00.000Z",
        hasOpenRequest: true,
        alreadyRefunded: false,
      },
    ]);

    const result = await requestRefundAction({
      purchaseType: "boost",
      referenceId: "campaign-1",
    });

    expect(result.ok).toBe(false);
    expect(dbMocks.createRefundRequest).not.toHaveBeenCalled();
  });

  it("still accepts a first request on the same purchase", async () => {
    dbMocks.getHostRefundablePurchases.mockResolvedValue([
      {
        purchaseType: "boost",
        referenceId: "campaign-1",
        stripePaymentIntentId: "pi_boost_1",
        amountCents: 20000,
        label: "14-day listing boost",
        purchasedAt: "2026-07-01T00:00:00.000Z",
        hasOpenRequest: false,
        alreadyRefunded: false,
      },
    ]);

    await expect(
      requestRefundAction({ purchaseType: "boost", referenceId: "campaign-1" }),
    ).resolves.toEqual({ ok: true });
    expect(dbMocks.createRefundRequest).toHaveBeenCalledOnce();
  });
});

describe("the pure rules behind both decisions", () => {
  it("reads a dropped refundable balance as a refund that landed", () => {
    expect(refundLandedDespiteError(20000, 0, 20000)).toBe(true);
    expect(refundLandedDespiteError(20000, 19900, 100)).toBe(true);
    // Not enough movement to account for this refund.
    expect(refundLandedDespiteError(20000, 19950, 100)).toBe(false);
    expect(refundLandedDespiteError(20000, 20000, 20000)).toBe(false);
    // A rising balance is not evidence of anything.
    expect(refundLandedDespiteError(20000, 20500, 100)).toBe(false);
  });

  it("calls a refund full only when it exhausts what Stripe still held", () => {
    expect(refundExhaustsCharge(19900, 19900)).toBe(true);
    expect(refundExhaustsCharge(100, 19900)).toBe(false);
    expect(refundExhaustsCharge(9900, 9900)).toBe(true);
    // Nothing refundable is not a full refund — it is no refund.
    expect(refundExhaustsCharge(0, 0)).toBe(false);
  });
});
