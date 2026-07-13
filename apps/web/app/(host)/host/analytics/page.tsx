import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getHostAnalytics, getHostProfile } from "@explore-and-earn/db";

import { HostSectionHeading } from "../../../../components/host";
import { HostAnalyticsDashboard } from "../../../../components/host/HostAnalyticsDashboard";
import { EmptyState } from "../../../../components/discovery";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Analytics" };

export const dynamic = "force-dynamic";

export default async function HostAnalyticsPage() {
  const { userId, getToken } = await auth();
  if (!userId) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          title="Analytics"
          description="Sign in as a host to see applications, invite rates, and per-listing performance."
        />
        <EmptyState
          title="Sign in to view analytics"
          message="You need to be signed in as a host to view your dashboard analytics."
        />
      </section>
    );
  }

  const token = await getToken();
  if (!token) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          title="Analytics"
          description="Application pipeline, invite rates, and per-listing performance."
        />
        <EmptyState
          title="Session expired"
          message="Sign in again to view your analytics."
        />
      </section>
    );
  }

  const [analytics, hostProfile] = await Promise.all([
    getHostAnalytics(token, userId),
    getHostProfile(token, userId),
  ]);

  const subscriptionTier = hostProfile?.subscriptionTier ?? "none";
  // Gate per-listing data at the server — never send it to the DOM for unpaid tiers.
  const gatedAnalytics = subscriptionTier === "none"
    ? { ...analytics, perListingStats: [] }
    : analytics;

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Analytics"
        description="Application pipeline, invite acceptance rates, and per-listing performance across all your opportunities."
      />
      <HostAnalyticsDashboard analytics={gatedAnalytics} subscriptionTier={subscriptionTier} />
    </section>
  );
}
