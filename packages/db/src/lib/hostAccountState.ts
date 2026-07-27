/**
 * Host account state, decoded from subscription state.
 *
 * A pure module with no `server-only` import, for the same reason
 * ./entitlements.ts is one: it has to be unit-testable, and a decode that lives
 * in src/queries/ cannot be loaded by vitest at all.
 *
 * WHAT THIS IS FOR. Commercial redesign D6 moves the paid line from profile
 * creation to PUBLICATION (migration 086), which creates a host who has a real
 * workspace and no plan. That host is a PROSPECT, and the product owes them
 * different words from the ones it owes a host whose card just failed. Before
 * D6 the distinction did not exist — a host without a plan could not have a
 * workspace to be shown anything in.
 *
 * WHAT THIS IS NOT. Not a gate, and not consulted by one. Every refusal that
 * matters is made by the database: private.enforce_listing_allowance refuses
 * publication for tier 'none', and it does so whether or not anything here
 * agrees. This decides which SENTENCE a host reads, never what they may do. A
 * caller that uses it to decide whether to attempt a write has misread it.
 */

/**
 * Where a host account sits relative to billing.
 *
 * - `prospect` — never paid, or paid once and fully churned. Has (or may have) a
 *   workspace, may draft, may not publish. The one state that gets activation
 *   copy.
 * - `lapsed`   — a live subscription in a recoverable payment failure. The
 *   billing surfaces already speak to this; nothing new is said to them.
 * - `active`   — on one of the three paid plans and paying.
 * - `cancelled`— on a paid tier that will not renew. Still entitled for the rest
 *   of the period, so NOT a prospect and NOT gated; distinguished from `active`
 *   only so a caller can say something about the end date if it wants to.
 */
export type HostAccountState = "prospect" | "lapsed" | "active" | "cancelled";

/**
 * The two fields of public.host_subscriptions this decode reads.
 *
 * Structural, not the concrete `HostSubscriptionState` interface, so this module
 * takes no dependency on the server-only query layer that produces it.
 */
export interface HostAccountSubscriptionInput {
  readonly tier?: string | null;
  readonly billingStatus?: string | null;
}

/**
 * Billing statuses that mean "there IS a subscription and it is in trouble",
 * as opposed to "there is no subscription".
 *
 * The Stripe webhook collapses tier to 'none' for every status outside
 * active/trialing/past_due, so a row can carry tier 'none' while the
 * subscription itself is still open — mid-dunning, paused, or unpaid. Those
 * hosts are recoverable through the billing portal, and telling them to
 * "activate a plan" would be both wrong and insulting: they have one.
 */
const LAPSED_BILLING_STATUSES: readonly string[] = [
  "past_due",
  "unpaid",
  "paused",
];

/** The three paid plans. Duplicated from ./entitlements to keep this module free of imports. */
const PAID_TIERS: readonly string[] = ["starter", "professional", "enterprise"];

/**
 * Decode a host's account state from their subscription row.
 *
 * `null` / `undefined` means NO ROW, which is the state of every account that
 * has never opened checkout, and it decodes to `prospect`. It does NOT mean "the
 * read failed" — callers must not flatten a thrown read into null here. See
 * getHostSubscriptionByClerkUserId, whose contract says the same thing for the
 * same reason: "the authority could not be consulted" is a different fact from
 * "this user has no subscription", and a caller that confuses the two will show
 * a paying host an activation banner.
 */
export function hostAccountState(
  subscription: HostAccountSubscriptionInput | null | undefined,
): HostAccountState {
  const tier = subscription?.tier ?? "none";
  const billingStatus = subscription?.billingStatus ?? "none";

  if (PAID_TIERS.includes(tier)) {
    // A paid tier that will not renew. Still entitled until the period ends, so
    // it is deliberately not `prospect`: nothing about their workspace is gated
    // today, and the allowance trigger agrees, because the tier is still paid.
    return billingStatus === "cancelled" ? "cancelled" : "active";
  }

  // Tier 'none' with the subscription still open — dunning, paused or unpaid.
  if (LAPSED_BILLING_STATUSES.includes(billingStatus)) return "lapsed";

  // No row, 'none', or a subscription that is fully over. All three are a host
  // with nothing to recover through the portal, so activation is the honest ask.
  return "prospect";
}

/**
 * True when the account has no plan behind it and publication will be refused.
 *
 * A convenience over {@link hostAccountState} so call sites read as the question
 * they are asking. Still not a gate — see the module header.
 */
export function isProspectHostAccount(state: HostAccountState): boolean {
  return state === "prospect";
}
