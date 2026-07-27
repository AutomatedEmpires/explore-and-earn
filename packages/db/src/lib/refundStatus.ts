/**
 * Refund lifecycle vocabulary, in a plain module.
 *
 * No "server-only" import here on purpose: `queries/refunds.ts` cannot be loaded
 * by vitest, so the one decision that must not be re-implemented next to its
 * assertions — *which statuses mean the money question is still open* — lives
 * here where a test imports the shipped predicate rather than a copy of it.
 *
 * 047 declares five statuses. Two of them are unresolved:
 *
 *   requested  a host filed it and no admin has decided
 *   approved   an admin claimed the row and the Stripe call is in flight, OR it
 *              started and never recorded its outcome
 *
 * `approved` is the one that gets forgotten. It is a PERSISTED state where
 * Stripe may already have paid out, so anything that reports "what still needs a
 * human" has to count it — a row stuck there is money that left with nothing
 * recorded against it.
 */

/** Refund lifecycle — mirrors the CHECK in 047. */
export type RefundStatus =
  | "requested"
  | "approved"
  | "denied"
  | "refunded"
  | "failed";

/**
 * Statuses where a refund request has not reached a terminal outcome.
 *
 * NOT the same question as "may an operator press Approve/Deny": that is
 * {@link isActionableRefundStatus}, and it is deliberately narrower, because a
 * claimed row may already have money in flight.
 */
export const UNRESOLVED_REFUND_STATUSES: readonly RefundStatus[] = [
  "requested",
  "approved",
];

/** True when this request still has no terminal outcome recorded. */
export function isUnresolvedRefundStatus(status: string): boolean {
  return (UNRESOLVED_REFUND_STATUSES as readonly string[]).includes(status);
}

/**
 * True when an operator may still decide this request.
 *
 * Only 'requested'. An 'approved' row has been claimed by
 * claimRefundForProcessing and may already have been paid out by Stripe, so
 * offering Approve/Deny on it would offer a second payout.
 */
export function isActionableRefundStatus(status: string): boolean {
  return status === "requested";
}
