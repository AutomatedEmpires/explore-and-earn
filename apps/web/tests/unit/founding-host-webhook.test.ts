/**
 * THE MONEY WINS THE RACE, AND THE COUNT STAYS TRUE.
 *
 * Between a host opening an early-host checkout and the money actually landing —
 * instant for a card, days for a bank debit — the last place can go to somebody
 * else, or the founder can close enrolment. Three answers were available and two
 * of them are wrong:
 *
 *   * refuse the entitlement — takes the customer's money and gives them
 *     nothing, over a price that is a perfectly valid plan price;
 *   * increment past capacity — breaks the "N of CAPACITY remain" figure the
 *     public page is quoting to everybody else.
 *
 * So the plan is granted and the over-subscription is recorded, in two places
 * that different people read: the error tracker, where it pages, and a table the
 * founder's own console lists. Silence is the one outcome that is never
 * available, and that is what this file pins.
 *
 * Also pinned: a place is consumed ONLY on a paid, early-host checkout, exactly
 * once per identity however many times Stripe redelivers, and never by an
 * ordinary purchase. The claim function's own transactional refusals live in
 * tools/db-assert/sql/assert_founding_host_program.sql.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("server-only", () => ({}));

const claimSeatMock = vi.hoisted(() => vi.fn());
const recordDiscrepancyMock = vi.hoisted(() => vi.fn());
const upsertSubscriptionMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/sentry", () => ({
  reportError: reportErrorMock,
  reportMessage: vi.fn(),
}));

/** A host_profiles chain that reports one matched row, so the sync resolves. */
function matchingBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  const settle = () => Promise.resolve({ data: [{ id: "h1" }], error: null });
  for (const method of ["update", "eq", "select", "limit"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = () => settle();
  builder.single = () => settle();
  builder.then = (a: unknown, b: unknown) => settle().then(a as never, b as never);
  return builder;
}

vi.mock("@explore-and-earn/db", () => ({
  adminClient: () => ({ from: () => matchingBuilder() }),
  activateBoostCampaignFromCheckout: vi.fn(),
  claimFoundingHostSeat: claimSeatMock,
  closeHostListingsOverAllowance: vi.fn(async () => 0),
  creditListingSlotPurchase: vi.fn(),
  getHostSubscriptionByClerkUserId: vi.fn(async () => null),
  insertHostAnnouncement: vi.fn(),
  recordFoundingClaimDiscrepancy: recordDiscrepancyMock,
  recordInvitePackPurchase: vi.fn(),
  revokeListingSlotPurchase: vi.fn(),
  syncListingSlotSubscription: vi.fn(),
  upsertHostSubscription: upsertSubscriptionMock,
}));

const { handleStripeWebhookEvent } = await import("../../services/stripe");

function checkout(options: {
  founding: boolean;
  paymentStatus?: string;
}): Stripe.Event {
  return {
    id: "evt_founding",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_founding",
        mode: "subscription",
        payment_status: options.paymentStatus ?? "paid",
        customer: null,
        client_reference_id: null,
        metadata: {
          clerkUserId: "user_founding",
          subscriptionTier: "starter",
          ...(options.founding ? { foundingHost: "true" } : {}),
        },
      },
    },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  claimSeatMock.mockResolvedValue({ ok: true, alreadyClaimed: false });
});

describe("the grant path for a paid early-host checkout", () => {
  it("consumes a place when the claim succeeds", async () => {
    const result = await handleStripeWebhookEvent(checkout({ founding: true }));

    expect(claimSeatMock).toHaveBeenCalledWith("user_founding");
    expect(result.action).toBe("claimed_founding_seat");
    expect(result.tier).toBe("starter");
    expect(recordDiscrepancyMock).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  /**
   * Stripe delivers at least once. A redelivery meeting an idempotent claim is
   * the system WORKING, so it must not be recorded as an over-subscription — the
   * founder's queue would fill with copies of successful grants.
   */
  it("treats a redelivery as a replay, not a discrepancy", async () => {
    claimSeatMock.mockResolvedValue({ ok: true, alreadyClaimed: true });

    const result = await handleStripeWebhookEvent(checkout({ founding: true }));

    expect(result.action).toBe("founding_seat_already_claimed");
    expect(recordDiscrepancyMock).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("STILL GRANTS THE PAID TIER when the claim is refused, and records it loudly", async () => {
    claimSeatMock.mockResolvedValue({ ok: false, reason: "full" });

    const result = await handleStripeWebhookEvent(checkout({ founding: true }));

    // The entitlement landed: money arrived against a valid plan price.
    expect(upsertSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: "user_founding", tier: "starter" }),
    );
    expect(result.tier).toBe("starter");
    expect(result.action).toBe("founding_seat_refused_full");

    // …and the over-subscription is not silent, in either place.
    expect(recordDiscrepancyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: "user_founding",
        reason: "full",
        stripeCheckoutSessionId: "cs_founding",
      }),
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A throw here would answer Stripe non-2xx and force a redelivery of a grant
   * that already succeeded. Sustained 5xx is the documented way Stripe disables
   * an endpoint, which would then silently break every later grant AND every
   * revocation — a far larger failure than one unhonoured discount.
   */
  it.each(["full", "ended", "not_configured", "claim_unavailable"])(
    "resolves rather than throwing when the claim answers %s",
    async (reason) => {
      claimSeatMock.mockResolvedValue({ ok: false, reason });

      await expect(
        handleStripeWebhookEvent(checkout({ founding: true })),
      ).resolves.toEqual(expect.objectContaining({ tier: "starter" }));
      expect(recordDiscrepancyMock).toHaveBeenCalledTimes(1);
    },
  );

  /** An ordinary purchase must never consume a place. */
  it("consumes nothing for a checkout that was not opened at the discounted rate", async () => {
    const result = await handleStripeWebhookEvent(checkout({ founding: false }));

    expect(claimSeatMock).not.toHaveBeenCalled();
    expect(result.action).toBe("synced_checkout_session");
  });

  /**
   * `checkout.session.completed` does not mean paid: a delayed-notification
   * method fires it unpaid and may later FAIL. Granting nothing there is already
   * the rule; consuming a place would have taken one anyway, against money that
   * never arrived.
   */
  it("consumes nothing while the payment is still settling", async () => {
    const result = await handleStripeWebhookEvent(
      checkout({ founding: true, paymentStatus: "unpaid" }),
    );

    expect(result.action).toBe("deferred_unpaid_checkout");
    expect(claimSeatMock).not.toHaveBeenCalled();
    expect(recordDiscrepancyMock).not.toHaveBeenCalled();
  });

  /**
   * The settlement event for that same delayed payment runs the identical path,
   * so the place is consumed when the money actually lands and not before.
   */
  it("consumes the place on the settlement event instead", async () => {
    const settled = checkout({ founding: true }) as unknown as {
      type: string;
    };
    settled.type = "checkout.session.async_payment_succeeded";

    const result = await handleStripeWebhookEvent(
      settled as unknown as Stripe.Event,
    );

    expect(claimSeatMock).toHaveBeenCalledWith("user_founding");
    expect(result.action).toBe("claimed_founding_seat");
  });
});
