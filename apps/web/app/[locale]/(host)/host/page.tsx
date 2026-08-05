import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import {
  emptyHostAnalytics,
  emptyHostHiringPulse,
  getApplicationCountsByListing,
  getHostAnalytics,
  getHostHiringPulse,
  getHostListingSignals,
  getHostProfile,
  getInviteEntitlement,
  getNewApplicationCountsByListing,
  getRecentActivityForHost,
  getUnreadMessageCount,
  type HostListingSignal,
} from "@explore-and-earn/db";
import {
  hasVerifiedHostSubscription,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";

import { HostDashboard, type PlanUsageRow } from "../../../../components/host";
import { hostProfileCompleteness } from "../../../../components/host/workspaceModel";
import { devHostProfile, isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";
import { cachedHostAccountState } from "../../../../lib/serverCache";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Overview" };

// Per-host and time-windowed — never statically cached.
export const dynamic = "force-dynamic";

const TIER_LABEL: Record<string, string> = {
  none: "No plan",
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

type EntitledTier = keyof typeof PLAN_ENTITLEMENTS;

/**
 * The contract's entitlements for a stored tier, or null.
 *
 * Null is the honest answer for tier 'none' and for anything outside the table:
 * the usage row then prints the count alone. Coercing to zero would tell a
 * prospect they had used up an allowance they were never given.
 */
function entitlementsFor(tier: string) {
  return Object.prototype.hasOwnProperty.call(PLAN_ENTITLEMENTS, tier)
    ? PLAN_ENTITLEMENTS[tier as EntitledTier]
    : null;
}

/**
 * The overview's data assembly.
 *
 * EVERY READ DEGRADES ALONE. The overview has seven panels and each answers a
 * different question, so one failing read must not blank the other six — but a
 * fallback must never be MORE generous than the truth: analytics falls back to
 * `emptyHostAnalytics()`, which resolves to the "basic" scope, so a read fault
 * cannot hand a Starter host the paid per-listing breakdown.
 */
export default async function HostOverviewPage() {
  // Keep the local review dashboard deterministic and instant even when a
  // configured local Supabase stack is stopped. This branch is unreachable in
  // production/preview and only activates for the explicit host role cookie.
  if (isDevBenchEnabled() && (await readDevRole()) === "host") {
    const profile = devHostProfile();
    const tier = profile.subscriptionTier;
    const entitlements = entitlementsFor(tier);
    const planUsage: PlanUsageRow[] = [
      {
        id: "listings",
        label: "Published listings",
        used: 0,
        allowance: entitlements?.listings ?? null,
        note: "Live, paused, and in-review listings count toward your plan.",
      },
      {
        id: "invites",
        label: "Invite credits",
        used: 0,
        allowance: entitlements?.includedInviteCredits ?? null,
        note: "Resets at the start of each month.",
      },
    ];

    return (
      <div className={styles.block}>
        <HostDashboard
          companyName={profile.companyName}
          hostName={profile.hostName}
          location={profile.primaryLocationName}
          coverPhotoUrl={profile.photoUrl}
          verified={hasVerifiedHostSubscription(tier)}
          planLabel={TIER_LABEL[tier] ?? "No plan"}
          accountState="active"
          primaryLane={profile.categoryScopes[0] ?? null}
          profile={hostProfileCompleteness(profile)}
          analytics={emptyHostAnalytics()}
          pulse={emptyHostHiringPulse()}
          signals={[]}
          applicationCounts={{}}
          newApplicationCounts={{}}
          unread={0}
          planUsage={planUsage}
          recentActivity={[]}
          publicProfileHref={null}
        />
      </div>
    );
  }

  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
    return (
      <div className={styles.block}>
        <p>Sign in as a host to view your workspace.</p>
      </div>
    );
  }

  const [
    profile,
    analytics,
    pulse,
    signalMap,
    applicationCounts,
    newApplicationCounts,
    unread,
    recentActivity,
    inviteEntitlement,
    accountState,
  ] = await Promise.all([
    getHostProfile(token, userId).catch(() => null),
    getHostAnalytics(token, userId).catch(() => emptyHostAnalytics()),
    getHostHiringPulse(token, userId).catch(() => emptyHostHiringPulse()),
    getHostListingSignals(token, userId).catch(
      () => new Map<string, HostListingSignal>(),
    ),
    getApplicationCountsByListing(token, userId).catch(
      () => ({}) as Record<string, number>,
    ),
    getNewApplicationCountsByListing(token, userId).catch(
      () => ({}) as Record<string, number>,
    ),
    getUnreadMessageCount(token, userId).catch(() => 0),
    getRecentActivityForHost(token, userId).catch(() => []),
    getInviteEntitlement(token, userId).catch(() => null),
    cachedHostAccountState(userId).catch(() => null),
  ]);

  const signals = [...signalMap.values()];
  const tier = profile?.subscriptionTier ?? "none";
  const entitlements = entitlementsFor(tier);

  // Plan usage. `used` is a count of REAL rows; `allowance` is the contract's
  // number, or null when the tier is outside the entitlement table — in which
  // case the row prints the usage alone rather than inventing a denominator.
  const countedListings = signals.filter((signal) =>
    ["live", "paused", "under_review"].includes(signal.status),
  ).length;

  const planUsage: PlanUsageRow[] = [
    {
      id: "listings",
      label: "Published listings",
      used: countedListings,
      allowance: entitlements ? entitlements.listings : null,
      note: "Live, paused, and in-review listings count toward your plan.",
    },
    {
      id: "invites",
      label: "Invite credits",
      // The ledger is the authority. When it is unavailable the row still shows
      // the plan's monthly allowance rather than a zero that would read as
      // "you have none left".
      used: inviteEntitlement?.monthlyUsed ?? 0,
      allowance:
        inviteEntitlement?.monthlyAllowance ??
        (entitlements ? entitlements.includedInviteCredits : null),
      note: inviteEntitlement?.ledgerAvailable
        ? inviteEntitlement.purchasedBalance > 0
          ? `Plus ${inviteEntitlement.purchasedBalance} purchased credits.`
          : "Resets at the start of each month."
        : "Metering activates soon — sourcing and scores are live now.",
    },
  ];

  // Team seats are deliberately ABSENT: TEAM_SEATS_BY_TIER is zero on every
  // tier, and D13 keeps seats out of every claim until the access exists.

  const publicProfileHref = profile ? `/host/${profile.id}` : null;

  return (
    <div className={styles.block}>
      <HostDashboard
        companyName={profile?.companyName ?? null}
        hostName={profile?.hostName ?? null}
        location={profile?.primaryLocationName ?? null}
        coverPhotoUrl={profile?.photoUrl ?? null}
        verified={hasVerifiedHostSubscription(tier)}
        planLabel={TIER_LABEL[tier] ?? "No plan"}
        accountState={accountState}
        primaryLane={profile?.categoryScopes?.[0] ?? null}
        profile={hostProfileCompleteness(profile)}
        analytics={analytics}
        pulse={pulse}
        signals={signals}
        applicationCounts={applicationCounts}
        newApplicationCounts={newApplicationCounts}
        unread={unread}
        planUsage={planUsage}
        recentActivity={recentActivity}
        publicProfileHref={publicProfileHref}
      />
    </div>
  );
}
