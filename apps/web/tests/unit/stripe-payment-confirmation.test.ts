import { describe, expect, it } from "vitest";

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
 * This mirrors the shipped predicate. It is deliberately a pure table rather
 * than a webhook integration test: the rule is "which payment_status values
 * mean paid", and that is what must never silently widen.
 */

type PaymentStatus = "paid" | "unpaid" | "no_payment_required";

/** Mirror of checkoutIsPaid in services/stripe/index.ts. */
function checkoutIsPaid(session: { payment_status?: PaymentStatus }): boolean {
  return (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  );
}

describe("checkout payment confirmation", () => {
  it("grants on a genuinely paid session", () => {
    expect(checkoutIsPaid({ payment_status: "paid" })).toBe(true);
  });

  it("grants when Stripe required no payment (100% coupon / zero-amount)", () => {
    expect(checkoutIsPaid({ payment_status: "no_payment_required" })).toBe(true);
  });

  /** The whole defect: ACH/SEPA/BNPL complete BEFORE the money settles. */
  it("does NOT grant on a completed-but-unpaid session", () => {
    expect(checkoutIsPaid({ payment_status: "unpaid" })).toBe(false);
  });

  it("does NOT grant when payment_status is absent", () => {
    expect(checkoutIsPaid({})).toBe(false);
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
    const granted = statuses.filter((s) => checkoutIsPaid({ payment_status: s }));
    expect(granted).toEqual(["paid", "no_payment_required"]);
  });
});
