/**
 * Effective active-listing allowance — plan entitlement plus purchased add-on
 * slots (founder decision 2026-07-26: "additional listings need to be an add
 * on. price based on tier.").
 *
 * THIS MODULE OWNS NO ARITHMETIC. Every function here delegates to
 * lib/entitlements.ts, which is the same arithmetic migration 083 runs inside
 * private.plan_listing_allowance() and private.host_purchased_listing_allowance().
 * It exists as the vocabulary the add-on surfaces already import.
 *
 * It used to hold a second, independent implementation, and the two disagreed on
 * both of the facts that matter:
 *
 *   * COUNTED STATUSES. This module counted live + paused; entitlements counts
 *     live + paused + under_review. Leaving under_review out is what let a host
 *     stage listings through review under a cap of 1 and then publish every one
 *     of them, because the count still read zero at each publish.
 *   * TIER 'none'. This module floored an unsubscribed host at the Starter
 *     allowance, which handed every non-paying host a free live listing and —
 *     paired with an add-on quoted at the Starter rate for tier 'none' — let
 *     them buy every further listing without ever buying the plan those
 *     listings belong to. The founder's decision of 2026-07-26 is that there is
 *     no free tier, 083's private.plan_listing_allowance() returns 0 for 'none',
 *     and the database is the thing that actually refuses. A cap check that
 *     quotes 1 where the database enforces 0 protects nothing; it only picks
 *     which of the two numbers the host is lied to with.
 *
 * 'none', and any tier string that cannot be read, resolve to ZERO — the same
 * discipline as seatLimitForTier: a tier we cannot read must never be handed an
 * entitlement. That fact lives once, in entitlements.planListingAllowance.
 *
 * WHERE THE ENFORCEMENT IS: migration 083's trg_listings_plan_allowance, and
 * nowhere else. queries/listingLifecycle.ts reads the allowance through 083's
 * my_listing_allowance_state RPC — not through this module — so its pre-flight
 * refusal cannot drift from the database's. The functions here are for DISPLAY:
 * telling a host on the settings page how many listings they may hold.
 */

import {
  LISTING_ALLOWANCE_COUNTED_STATUSES,
  hasListingCapacity,
  planListingAllowance,
  totalListingAllowance,
} from "./entitlements";

/** Listing statuses that consume a slot. Re-exported from entitlements so the
 * add-on surfaces and the enforcement path cannot describe different sets. */
export const CAP_COUNTED_LISTING_STATUSES = LISTING_ALLOWANCE_COUNTED_STATUSES;

/** Listings INCLUDED in a stored tier. 'none' is ZERO — there is no free tier. */
export function includedListingCapFor(tier: string | null | undefined): number {
  return planListingAllowance(tier);
}

/**
 * Total active listings a host may hold: the plan's included count plus every
 * add-on slot they have paid for.
 *
 * A negative or non-integer purchased figure contributes NOTHING rather than
 * subtracting — a corrupted allowance must not silently shrink a cap the host
 * has already paid for, and must not widen one either.
 */
export function effectiveListingCap(
  tier: string | null | undefined,
  purchasedSlots: number | null | undefined,
): number {
  return totalListingAllowance(tier, purchasedSlots);
}

/**
 * Can a host consume one more active-listing slot?
 *
 * Expressed as a REFUSAL predicate: the caller must ask permission, and the
 * default answer for a count at or above the cap is no.
 */
export function hasListingSlotAvailable(args: {
  readonly tier: string | null | undefined;
  readonly purchasedSlots: number | null | undefined;
  readonly activeListingCount: number;
}): boolean {
  return hasListingCapacity(
    args.activeListingCount,
    effectiveListingCap(args.tier, args.purchasedSlots),
  );
}
