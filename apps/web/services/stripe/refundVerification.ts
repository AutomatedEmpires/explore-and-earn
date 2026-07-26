import { formatMoney } from "@explore-and-earn/contracts";

// ─────────────────────────────────────────────────────────────────────────────
// Pure refund-verification rules.
//
// No Stripe SDK import and no "server-only" here on purpose: these are the
// decisions that must never be re-implemented next to their assertions, so they
// live in a plain module the unit tests import directly and services/stripe
// consumes. The Stripe I/O that feeds them lives in services/stripe/index.ts.
//
// The rule they encode: a refund may never exceed what Stripe actually
// collected and has not already handed back. Every function reads its input
// structurally (unknown -> narrow) rather than against a pinned SDK interface,
// because the Invoice payload moved the PaymentIntent from a top-level
// `payment_intent` field to `payments[].payment.payment_intent`; both shapes are
// handled below so a pinned-API-version bump does not silently return null.
// ─────────────────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  const record = asRecord(value);
  const id = record?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Money display for operator-facing refusals — cents in, exact dollars out. */
function money(cents: number): string {
  return formatMoney(cents, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The PaymentIntent that actually paid an invoice, or null when the payload
 * carries none. Accepts either the legacy top-level `payment_intent` or the
 * current `payments[].payment.payment_intent` list; within the list only entries
 * whose own status is 'paid' count (an 'open' or 'canceled' invoice payment did
 * not collect anything).
 */
export function invoicePaymentIntentId(invoice: unknown): string | null {
  const inv = asRecord(invoice);
  if (!inv) return null;

  const direct = idOf(inv.payment_intent);
  if (direct) return direct;

  const payments = asRecord(inv.payments)?.data;
  if (!Array.isArray(payments)) return null;

  for (const entry of payments) {
    const payment = asRecord(entry);
    if (!payment) continue;
    if (typeof payment.status === "string" && payment.status !== "paid") continue;
    const intentId = idOf(asRecord(payment.payment)?.payment_intent);
    if (intentId) return intentId;
  }

  return null;
}

/** Billing reasons Stripe stamps on an invoice raised by a subscription. */
const SUBSCRIPTION_BILLING_REASONS: ReadonlySet<string> = new Set([
  "subscription",
  "subscription_create",
  "subscription_cycle",
  "subscription_threshold",
  "subscription_update",
]);

/** One real subscription charge, resolved from a Stripe invoice. */
export interface SubscriptionCharge {
  readonly invoiceId: string;
  readonly paymentIntentId: string;
  /** What the customer actually paid on that invoice, integer cents. */
  readonly amountPaidCents: number;
  /** Invoice creation time (unix seconds) — used only to pick the newest. */
  readonly createdUnix: number;
}

/**
 * The newest SUBSCRIPTION charge in a list of Stripe invoices.
 *
 * Filtering on billing_reason is what keeps this off one-off purchases: it
 * accepts only invoices Stripe attributes to a subscription, and skips any
 * invoice with no money paid or no resolvable PaymentIntent, because neither can
 * be refunded.
 */
export function selectLatestSubscriptionCharge(
  invoices: readonly unknown[],
): SubscriptionCharge | null {
  let best: SubscriptionCharge | null = null;

  for (const raw of invoices) {
    const inv = asRecord(raw);
    if (!inv) continue;

    const billingReason = typeof inv.billing_reason === "string" ? inv.billing_reason : "";
    if (!SUBSCRIPTION_BILLING_REASONS.has(billingReason)) continue;

    const amountPaidCents = typeof inv.amount_paid === "number" ? inv.amount_paid : 0;
    if (amountPaidCents <= 0) continue;

    const paymentIntentId = invoicePaymentIntentId(inv);
    if (!paymentIntentId) continue;

    const createdUnix = typeof inv.created === "number" ? inv.created : 0;
    if (best && createdUnix <= best.createdUnix) continue;

    best = {
      invoiceId: idOf(inv.id) ?? "",
      paymentIntentId,
      amountPaidCents,
      createdUnix,
    };
  }

  return best;
}

/**
 * Refund states that are still holding money away from the merchant. A
 * 'canceled' or 'failed' refund returned nothing, so it must NOT be counted —
 * counting it would under-report what is still refundable and block a legitimate
 * refund; missing a 'pending' one would over-report it and allow a double
 * refund. Anything Stripe reports that is not explicitly dead counts.
 */
const DEAD_REFUND_STATUSES: ReadonlySet<string> = new Set(["canceled", "failed"]);

/** Total cents already refunded (or in flight) across a list of Stripe refunds. */
export function refundedCents(refunds: readonly unknown[]): number {
  let total = 0;

  for (const raw of refunds) {
    const refund = asRecord(raw);
    if (!refund) continue;
    const status = typeof refund.status === "string" ? refund.status : "";
    if (DEAD_REFUND_STATUSES.has(status)) continue;
    const amount = typeof refund.amount === "number" ? refund.amount : 0;
    if (amount > 0) total += amount;
  }

  return total;
}

/** What Stripe can still give back on a charge, never negative. */
export function refundableCents(
  amountReceivedCents: number,
  alreadyRefundedCents: number,
): number {
  const received = Number.isFinite(amountReceivedCents) ? amountReceivedCents : 0;
  const refunded = Number.isFinite(alreadyRefundedCents) ? alreadyRefundedCents : 0;
  return Math.max(0, received - refunded);
}

/**
 * The refusal message for a refund that cannot be issued, or null when the
 * amount is within what Stripe still holds.
 *
 * This is the money gate: it refuses rather than silently clamping, because a
 * clamped refund would quietly pay out a different number than the one the admin
 * approved and the host was shown.
 */
export function overRefundRefusal(
  requestedCents: number,
  availableCents: number,
): string | null {
  if (!Number.isInteger(requestedCents) || requestedCents <= 0) {
    return "Refund amount must be a positive whole number of cents.";
  }
  if (availableCents <= 0) {
    return "Stripe has no refundable balance left on this charge.";
  }
  if (requestedCents > availableCents) {
    return `Refund of ${money(requestedCents)} exceeds the ${money(availableCents)} still refundable on this charge.`;
  }
  return null;
}

/**
 * Did the refund actually land, even though the call reported an error?
 *
 * `refunds.create` failing does NOT mean no refund was created. A timeout, a
 * dropped connection, or a 5xx after Stripe committed all produce an error on a
 * request that moved money. Treating every error as "nothing happened" is what
 * made the failure path skip revocation: the money left and the boost kept
 * running / the announcement stayed in the feed / the plan stayed granted.
 *
 * The only trustworthy answer comes from Stripe itself, so the caller re-reads
 * the charge's refundable balance and hands both readings here. If what Stripe
 * can still give back dropped by at least the requested amount, that money is
 * gone from the merchant whatever the create call said, and the request must be
 * recorded as refunded and its purchase revoked.
 *
 * Deliberately not symmetric: an unchanged balance is NOT proof the refund
 * failed either (Stripe could still be settling), which is why the caller keeps
 * the ambiguity in the admin note rather than claiming a clean failure.
 */
export function refundLandedDespiteError(
  refundableBeforeCents: number,
  refundableAfterCents: number,
  requestedCents: number,
): boolean {
  if (
    !Number.isFinite(refundableBeforeCents) ||
    !Number.isFinite(refundableAfterCents) ||
    !Number.isInteger(requestedCents) ||
    requestedCents <= 0
  ) {
    return false;
  }
  return refundableBeforeCents - refundableAfterCents >= requestedCents;
}

/**
 * Does this refund hand back everything Stripe still held on the charge?
 *
 * This is the proportionality test for revocation. A subscription refund used to
 * cancel the host's entire plan unconditionally, so a $1 goodwill refund on a
 * $199 charge took the whole plan away — the platform kept $198 and delivered
 * nothing. There is no fractional subscription to cancel, so the honest rule is
 * all-or-nothing measured against the charge: cancel only when the charge has
 * been fully handed back, and otherwise leave the plan the host is still paying
 * for alone.
 *
 * Measured against what was still REFUNDABLE rather than the original amount, so
 * a second partial refund that exhausts the remainder correctly counts as full.
 */
export function refundExhaustsCharge(
  refundedCents: number,
  refundableBeforeCents: number,
): boolean {
  if (!Number.isFinite(refundedCents) || !Number.isFinite(refundableBeforeCents)) {
    return false;
  }
  if (refundableBeforeCents <= 0) return false;
  return refundedCents >= refundableBeforeCents;
}

/**
 * Stripe idempotency key for one refund request row.
 *
 * Derived from the refund_requests id and nothing else, so a retry of the same
 * approval — a double-clicked admin, a re-run action, a redeployed server —
 * resolves to the SAME key and Stripe returns the original refund instead of
 * issuing a second one.
 */
export function refundIdempotencyKey(refundRequestId: string): string {
  return `refund_request_${refundRequestId}`;
}
