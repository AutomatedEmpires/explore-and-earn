/**
 * Host analytics entitlement — the basic/full split, as pure logic.
 *
 * PLAN_ENTITLEMENTS has declared `analytics: "basic" | "full"` since ADR-039 and
 * four surfaces sell the distinction (the for-hosts pricing grid, the homepage
 * plan cards, the settings plan cards, and the Stripe product descriptions).
 * Nothing implemented it: the analytics page gated the per-listing breakdown on
 * `subscriptionTier === "none"`, so a Starter host — sold "basic analytics" —
 * received the full per-listing dataset.
 *
 * WHAT EACH SCOPE MEANS (the single definition; ANALYTICS_ENTITLEMENT in
 * packages/contracts/src/pricing.ts carries the same words):
 *
 *   basic — account-wide aggregates only:
 *             • applications by pipeline stage, across all listings
 *             • how many listings exist and how many are live
 *             • invite acceptance rate, across all listings
 *   full  — everything in basic, PLUS the per-listing breakdown:
 *             • applications by status for each listing
 *             • invites sent and invites accepted for each listing
 *
 * `listingCount` is deliberately OUTSIDE the gate. It is a count the host can
 * read off their own listings page, and blanking it would make the dashboard
 * tell a Starter host they have zero listings — trading a paywall for a lie.
 *
 * This module is plain TypeScript with no `server-only` import so it is unit
 * testable, and the redaction lives here rather than in a page so every caller
 * of getHostAnalytics gets the same answer.
 */

import {
  ANALYTICS_ENTITLEMENT,
  type AnalyticsScope,
} from "@explore-and-earn/contracts";

export type { AnalyticsScope };

/** A stored host subscription tier, including "no active subscription". */
export type StoredHostTier = keyof typeof ANALYTICS_ENTITLEMENT;

export interface ApplicationsByStage {
  readonly [status: string]: number;
}

export interface HostPerListingStats {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly listingStatus: string;
  readonly applicationsByStatus: ApplicationsByStage;
  readonly totalApplications: number;
  readonly invitesSent: number;
  readonly invitesAccepted: number;
}

export interface HostAnalytics {
  readonly totalApplicationsByStatus: ApplicationsByStage;
  readonly activeListingCount: number;
  /**
   * Total listings the host owns, in any status. Available on EVERY scope —
   * see the module note above.
   */
  readonly listingCount: number;
  /** Accepted invites divided by total sent, from 0 to 1. */
  readonly inviteAcceptanceRate: number;
  /**
   * Per-listing performance. EMPTY on the "basic" scope — the paid distinction.
   * Read `analyticsScope`, never `perListingStats.length`, to decide whether a
   * host has listings.
   */
  readonly perListingStats: HostPerListingStats[];
  /** Which scope produced this object. */
  readonly analyticsScope: AnalyticsScope;
}

/**
 * The analytics depth a stored tier is entitled to. Unknown values resolve to
 * "basic": an unreadable tier must never buy the paid view.
 */
export function analyticsScopeForTier(tier: string | null | undefined): AnalyticsScope {
  if (tier === "starter" || tier === "professional" || tier === "enterprise") {
    return ANALYTICS_ENTITLEMENT[tier];
  }
  return ANALYTICS_ENTITLEMENT.none;
}

/**
 * Redact a full analytics result down to what `scope` is entitled to.
 *
 * Applied at the data source (getHostAnalytics), not in a page, so per-listing
 * rows for a basic-tier host never reach a server component — let alone the
 * DOM — regardless of which surface asked.
 */
export function applyAnalyticsScope(
  analytics: Omit<HostAnalytics, "analyticsScope">,
  scope: AnalyticsScope,
): HostAnalytics {
  if (scope === "full") {
    return { ...analytics, analyticsScope: scope };
  }
  return {
    totalApplicationsByStatus: analytics.totalApplicationsByStatus,
    activeListingCount: analytics.activeListingCount,
    listingCount: analytics.listingCount,
    inviteAcceptanceRate: analytics.inviteAcceptanceRate,
    perListingStats: [],
    analyticsScope: scope,
  };
}

/** Zeroed analytics for a host with no profile, no listings, or a read fault. */
export function emptyHostAnalytics(scope: AnalyticsScope = "basic"): HostAnalytics {
  return {
    totalApplicationsByStatus: {},
    activeListingCount: 0,
    listingCount: 0,
    inviteAcceptanceRate: 0,
    perListingStats: [],
    analyticsScope: scope,
  };
}
