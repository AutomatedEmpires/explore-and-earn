import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import {
  emptyHostAnalytics,
  getHostDashboardStats,
  getRecentActivityForHost,
  getHostProfile,
  getHostAnalytics,
} from "@explore-and-earn/db";

import { HostDashboard } from "../../../../components/host";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard" };

// Dashboard data is per-host — never statically cached.
export const dynamic = "force-dynamic";

export default async function HostDashboardPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
    return (
      <div className={styles.block}>
        <p>Sign in as a host to view your dashboard.</p>
      </div>
    );
  }

  const [stats, recentActivity, hostProfile, analytics] = await Promise.all([
    getHostDashboardStats(token, userId).catch(() => ({
      listingsByStatus: {},
      applicationsThisMonth: {},
      pendingActions: 0,
    })),
    getRecentActivityForHost(token, userId).catch(() => []),
    getHostProfile(token, userId).catch(() => null),
    // A read fault falls back to the LEAST entitlement ("basic"), never the
    // most: an error must not hand out the paid per-listing view.
    getHostAnalytics(token, userId).catch(() => emptyHostAnalytics()),
  ]);

  return (
    <div className={styles.block}>
      <HostDashboard
        stats={stats}
        recentActivity={recentActivity}
        companyName={hostProfile?.companyName ?? null}
        primaryLane={hostProfile?.categoryScopes?.[0] ?? null}
        analytics={analytics}
      />
    </div>
  );
}
