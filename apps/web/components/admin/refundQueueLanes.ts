/**
 * The admin refund queue's lanes and status vocabulary, as DATA.
 *
 * Lives in a plain .ts module (not beside the component) for one reason: this
 * app sets `jsx: "preserve"`, so vitest cannot transform a .tsx and none of this
 * would be testable there. RefundQueue.tsx renders these entries and owns
 * nothing about which lanes exist or what a status means.
 *
 * The thing this file exists to stop: 'approved' is a PERSISTED state in which
 * Stripe may already have paid out, and it was on no operator surface — not a
 * lane, not a metric, and rendered with the word "Approved", which reads as a
 * finished, successful refund.
 */

/** Refund lifecycle — mirrors the CHECK in 047 and packages/db's RefundStatus. */
export type RefundStatusToken =
  | "requested"
  | "approved"
  | "denied"
  | "refunded"
  | "failed";

export type RefundStatusLane = "all" | RefundStatusToken;

/**
 * True when an admin may still decide this request.
 *
 * Only 'requested'. An 'approved' row has been claimed and the Stripe call may
 * already have moved money, so drawing Approve/Deny on it would offer a second
 * payout.
 */
export function isActionableRefund(status: string): boolean {
  return status === "requested";
}

/**
 * True when the request has no terminal outcome recorded — 'requested' (nobody
 * has decided) or 'approved' (claimed, outcome unrecorded). Deliberately wider
 * than {@link isActionableRefund}: these are the rows that still need a human,
 * even though only one of them takes a button.
 */
export function isUnresolvedRefund(status: string): boolean {
  return status === "requested" || status === "approved";
}

/**
 * Human label for a refund status. 'approved' reads as in-flight: the humanized
 * token "Approved" would look like a finished, successful refund, and the money
 * has not been confirmed back at that point.
 */
export function refundStatusLabel(status: string): string {
  switch (status) {
    case "requested":
      return "Awaiting review";
    case "approved":
      return "Processing";
    case "refunded":
      return "Refunded";
    case "denied":
      return "Denied";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

/** One filter lane in the queue toolbar. */
export interface RefundLane {
  readonly key: RefundStatusLane;
  readonly label: string;
}

/**
 * Every lane the toolbar offers. One per status 047 declares, plus "All" — so a
 * row can never exist in a status that has no lane to find it in.
 */
export const REFUND_LANES: readonly RefundLane[] = [
  { key: "all", label: "All" },
  { key: "requested", label: "Awaiting" },
  { key: "approved", label: "Processing" },
  { key: "refunded", label: "Refunded" },
  { key: "denied", label: "Denied" },
  { key: "failed", label: "Failed" },
];
