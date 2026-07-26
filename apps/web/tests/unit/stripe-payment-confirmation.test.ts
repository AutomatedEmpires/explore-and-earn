import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Nothing is granted until Stripe says the money is real (readiness audit
 * 2026-07-24).
 *
 * The defect this pins: syncCheckoutCompleted branched straight into granting a
 * subscription tier / boost campaign / paid announcement / invite credits on
 * `checkout.session.completed`, and never read session.payment_status.
 *
 * `completed` does NOT mean paid. Delayed-notification methods — ACH direct
 * debit, SEPA debit, bank transfers, BNPL — fire `completed` with
 * payment_status 'unpaid' and settle later via
 * checkout.session.async_payment_succeeded, or fail via async_payment_failed.
 * So a host could obtain a paid tier for money that never arrived.
 *
 * This file used to declare its own copy of checkoutIsPaid three lines above the
 * assertions, so it tested the copy: the shipped predicate could widen to grant
 * on 'unpaid' and every case here would still pass. It imports the real exported
 * predicate now — the rule is "which payment_status values mean paid", and that
 * is what must never silently widen.
 */

vi.mock("server-only", () => ({}));
vi.mock("@explore-and-earn/db", () => ({
  adminClient: () => ({}),
  activateBoostCampaignFromCheckout: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  recordInvitePackPurchase: vi.fn(),
}));

const { checkoutIsPaid } = await import("../../services/stripe");

type PaymentStatus = Stripe.Checkout.Session["payment_status"];

/** Only payment_status is read; the rest of the session is irrelevant here. */
function session(payment_status?: PaymentStatus): Stripe.Checkout.Session {
  return { payment_status } as unknown as Stripe.Checkout.Session;
}

describe("checkout payment confirmation", () => {
  it("grants on a genuinely paid session", () => {
    expect(checkoutIsPaid(session("paid"))).toBe(true);
  });

  it("grants when Stripe required no payment (100% coupon / zero-amount)", () => {
    expect(checkoutIsPaid(session("no_payment_required"))).toBe(true);
  });

  /** The whole defect: ACH/SEPA/BNPL complete BEFORE the money settles. */
  it("does NOT grant on a completed-but-unpaid session", () => {
    expect(checkoutIsPaid(session("unpaid"))).toBe(false);
  });

  it("does NOT grant when payment_status is absent", () => {
    expect(checkoutIsPaid(session())).toBe(false);
  });

  /**
   * The negative control: exactly two statuses may grant. If Stripe adds a new
   * one, it must default to NOT granting until someone decides otherwise.
   */
  it("NEVER grants for any status outside the paid pair", () => {
    const statuses = [
      "paid",
      "unpaid",
      "no_payment_required",
      "processing",
      "requires_action",
      "",
      undefined,
    ] as unknown as PaymentStatus[];
    const granted = statuses.filter((s) => checkoutIsPaid(session(s)));
    expect(granted).toEqual(["paid", "no_payment_required"]);
  });
});
