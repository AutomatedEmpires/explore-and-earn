/**
 * Effective active-listing allowance — plan entitlement plus purchased add-on
 * slots (founder decision 2026-07-26: "additional listings need to be an add
 * on. price based on tier.").
 *
 * Pure logic, no I/O, so the arithmetic that decides whether a host may publish
 * can be tested exhaustively. The enforcement point that USES it is
 * queries/listingLifecycle.ts (server-side, at draft -> under_review); the
 * database-side cap is migration 083's.
 */

import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

/** Listing statuses that consume a slot (the host-facing FAQ's own wording:
 * "each active (live or paused) listing counts toward your plan limit"). */
export const CAP_COUNTED_LISTING_STATUSES = ["live", "paused"] as const;

/**
 * Listings INCLUDED in a stored tier.
 *
 * "none" (no active subscription) is floored at the Starter entitlement — the
 * same policy as the boost-purchase tier fallback: the lowest real paid tier,
 * not zero and not unlimited.
 */
export function includedListingCapFor(tier: string | null | undefined): number {
  const entitlementTier =
    tier === "professional" || tier === "enterprise" ? tier : "starter";
  return PLAN_ENTITLEMENTS[entitlementTier].listings;
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
  const purchased =
    typeof purchasedSlots === "number" &&
    Number.isInteger(purchasedSlots) &&
    purchasedSlots > 0
      ? purchasedSlots
      : 0;
  return includedListingCapFor(tier) + purchased;
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
  return args.activeListingCount < effectiveListingCap(args.tier, args.purchasedSlots);
}
