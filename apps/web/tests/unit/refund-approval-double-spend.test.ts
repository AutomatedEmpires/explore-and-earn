/**
 * Approving a refund must claim the row BEFORE Stripe, and must be idempotent.
 *
 * The defect this pins: resolveRefundImpl called issueRefund first and recorded
 * the outcome afterwards, and stripe.refunds.create was invoked with no
 * idempotency key. Two approvals of the same request — a double-clicked admin, a
 * retried server action — therefore issued two real payouts, and only one of
 * them was ever recorded.
 *
 * The assertions below are about ORDER and REFUSAL: the claim precedes the
 * Stripe call, a lost claim never reaches Stripe at all, and the key handed to
 * Stripe is derived from the refund-request id so a replay returns the original
 * refund instead of creating a second one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const isAdminUserIdMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

const order = vi.hoisted(() => [] as string[]);

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

const { resolveRefundAction } = await import("../../app/actions/refunds");
const { refundIdempotencyKey } = await import(
  "../../services/stripe/refundVerification"
);

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

const BOOST_REQUEST = {
  id: REQUEST_ID,
  hostProfileId: "host-1",
  purchaseType: "boost" as const,
  referenceId: "campaign-1",
  stripePaymentIntentId: "pi_boost_1",
  amountCents: 20000,
  status: "requested" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;

  authMock.mockResolvedValue({ userId: "user_admin", getToken: async () => "tok" });
  isAdminUserIdMock.mockReturnValue(true);

  dbMocks.getRefundRequestById.mockResolvedValue({ ...BOOST_REQUEST });
  dbMocks.claimRefundForProcessing.mockImplementation(async () => {
    order.push("claim");
    return { ok: true };
  });
  dbMocks.markRefundResolved.mockImplementation(async () => {
    order.push("resolve");
    return { ok: true };
  });
  dbMocks.revokeRefundedPurchaseRow.mockResolvedValue({ ok: true });

  stripeMocks.getRefundableChargeCents.mockImplementation(async () => {
    order.push("verify");
    return { ok: true, refundableCents: 20000 };
  });
  stripeMocks.issueRefund.mockImplementation(async () => {
    order.push("stripe");
    return { ok: true, refundId: "re_1" };
  });
});

describe("refund approval — claim before Stripe", () => {
  it("verifies, claims the row, and only then issues the refund", async () => {
    await expect(resolveRefundAction(REQUEST_ID, "approve")).resolves.toEqual({
      ok: true,
    });

    expect(order).toEqual(["verify", "claim", "stripe", "resolve"]);
    expect(order.indexOf("claim")).toBeLessThan(order.indexOf("stripe"));
  });

  /**
   * The refusal that matters: a concurrent approval already took the row, so
   * this one must not move money.
   */
  it("issues NO refund when the claim is lost to a concurrent approval", async () => {
    dbMocks.claimRefundForProcessing.mockResolvedValue({
      ok: false,
      error: "Refund request is already being processed or was already resolved.",
    });

    const result = await resolveRefundAction(REQUEST_ID, "approve");

    expect(result.ok).toBe(false);
    expect(stripeMocks.issueRefund).not.toHaveBeenCalled();
    expect(dbMocks.markRefundResolved).not.toHaveBeenCalled();
    expect(dbMocks.revokeRefundedPurchaseRow).not.toHaveBeenCalled();
  });

  it("passes Stripe an idempotency key derived from the refund-request id", async () => {
    await resolveRefundAction(REQUEST_ID, "approve");

    expect(stripeMocks.issueRefund).toHaveBeenCalledWith(
      "pi_boost_1",
      20000,
      refundIdempotencyKey(REQUEST_ID),
    );
    // Derived from the row, not from the clock or a random value: the same
    // request approved twice must produce the same key.
    expect(refundIdempotencyKey(REQUEST_ID)).toBe(refundIdempotencyKey(REQUEST_ID));
    expect(refundIdempotencyKey(REQUEST_ID)).toContain(REQUEST_ID);
  });

  it("records the outcome against the claimed status, not the open one", async () => {
    await resolveRefundAction(REQUEST_ID, "approve");

    expect(dbMocks.markRefundResolved).toHaveBeenCalledWith(
      "test-service-key",
      expect.objectContaining({ status: "refunded", fromStatus: "approved" }),
    );
  });

  it("denies without claiming, verifying, or calling Stripe", async () => {
    await expect(resolveRefundAction(REQUEST_ID, "deny")).resolves.toEqual({
      ok: true,
    });

    expect(stripeMocks.getRefundableChargeCents).not.toHaveBeenCalled();
    expect(dbMocks.claimRefundForProcessing).not.toHaveBeenCalled();
    expect(stripeMocks.issueRefund).not.toHaveBeenCalled();
    expect(dbMocks.markRefundResolved).toHaveBeenCalledWith(
      "test-service-key",
      expect.objectContaining({ status: "denied" }),
    );
  });

  it("refuses a non-admin caller before reading anything", async () => {
    isAdminUserIdMock.mockReturnValue(false);

    await expect(resolveRefundAction(REQUEST_ID, "approve")).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(dbMocks.getRefundRequestById).not.toHaveBeenCalled();
    expect(stripeMocks.issueRefund).not.toHaveBeenCalled();
  });
});
