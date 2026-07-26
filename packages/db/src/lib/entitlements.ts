/**
 * Plan entitlement arithmetic, in a module with no `server-only` import so it
 * can be unit-tested directly.
 *
 * The DATABASE is the enforcement point for every number in here — migration 083
 * runs the same arithmetic inside private.plan_listing_allowance(),
 * private.plan_announcement_quota() and private.enforce_listing_allowance().
 * These functions exist so the application can tell a host WHY a write will be
 * refused before attempting it, and so a stale UI cannot claim capacity that the
 * database will reject. They are not a second gate, and nothing here is
 * sufficient on its own.
 */

import {
  ANNOUNCEMENT_MONTHLY_QUOTA,
  PLAN_ENTITLEMENTS,
  type ListingStatus,
  type PlanTier,
} from "@explore-and-earn/contracts";

/**
 * Statuses that occupy a plan slot.
 *
 * `under_review` is included, and that is the correction. The slot is committed
 * the moment a draft enters review: counting only live + paused let a host queue
 * an unlimited number of listings and have every one of them approved. Drafts
 * remain unlimited on every plan, which is what the host-facing FAQ says.
 */
export const LISTING_ALLOWANCE_COUNTED_STATUSES: readonly ListingStatus[] = [
  "live",
  "paused",
  "under_review",
];

/** True when `status` occupies one of the host's plan listing slots. */
export function countsTowardListingAllowance(status: ListingStatus): boolean {
  return LISTING_ALLOWANCE_COUNTED_STATUSES.includes(status);
}

/**
 * The three paid plans. Founder, 2026-07-26: "no host can create a profile or
 * publish for free. they are on one of 3 tiers."
 */
export const PAID_PLAN_TIERS = ["starter", "professional", "enterprise"] as const;
export type PaidPlanTier = (typeof PAID_PLAN_TIERS)[number];

/** True when the tier is one of the three paid plans — i.e. entitled to anything. */
export function isPaidPlanTier(tier: string | null | undefined): tier is PaidPlanTier {
  return (PAID_PLAN_TIERS as readonly string[]).includes(tier ?? "");
}

/**
 * Included active listings for a tier.
 *
 * 'none' is ZERO. It used to be floored at the Starter allowance, which handed
 * every unsubscribed host a free live listing while the FAQ said a plan was
 * required — the product sold one thing and the code did another.
 */
export function planListingAllowance(tier: string | null | undefined): number {
  return isPaidPlanTier(tier) ? PLAN_ENTITLEMENTS[tier].listings : 0;
}

/** Included plan announcements per calendar month for a tier ('none' is zero). */
export function planAnnouncementQuota(tier: string | null | undefined): number {
  return ANNOUNCEMENT_MONTHLY_QUOTA[tier ?? "none"] ?? 0;
}

/**
 * Total listing allowance: the plan's included count plus any purchased
 * extra-listing allowance. A negative or non-finite purchased value is read as
 * zero rather than being allowed to shrink the plan allowance.
 */
export function totalListingAllowance(
  tier: string | null | undefined,
  purchasedAllowance: number | null | undefined = 0,
): number {
  const purchased =
    typeof purchasedAllowance === "number" && Number.isFinite(purchasedAllowance)
      ? Math.max(0, Math.trunc(purchasedAllowance))
      : 0;
  return planListingAllowance(tier) + purchased;
}

/** True when a host holding `used` slots may take one more. */
export function hasListingCapacity(used: number, allowance: number): boolean {
  return used < allowance;
}

/** The shape public.my_listing_allowance_state(uuid) returns. */
export interface ListingAllowanceState {
  readonly tier: PlanTier;
  readonly allowance: number;
  readonly used: number;
}

/**
 * Normalize the RPC's jsonb payload. An unreadable field degrades to the value
 * that REFUSES — unknown tier becomes 'none', unknown allowance becomes 0 — so a
 * malformed response can never be mistaken for spare capacity.
 */
export function parseListingAllowanceState(value: unknown): ListingAllowanceState {
  const row = (value ?? {}) as Record<string, unknown>;
  const tier = typeof row.tier === "string" && isPaidPlanTier(row.tier) ? row.tier : "none";
  const allowance =
    typeof row.allowance === "number" && Number.isFinite(row.allowance)
      ? Math.max(0, Math.trunc(row.allowance))
      : 0;
  const used =
    typeof row.used === "number" && Number.isFinite(row.used)
      ? Math.max(0, Math.trunc(row.used))
      : Number.MAX_SAFE_INTEGER;
  return { tier, allowance, used };
}
