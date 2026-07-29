import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getHostAnalytics } from "@explore-and-earn/db";

import { HostSectionHeading } from "../../../../../components/host";
import { HostAnalyticsWorkspace } from "../../../../../components/host/HostAnalyticsWorkspace";
import { EmptyState } from "../../../../../components/discovery";
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

  // getHostAnalytics resolves the host's tier itself and returns data ALREADY
  // scoped to what their plan includes (packages/db/src/lib/hostAnalyticsScope).
  // The gate is not re-applied here: a page that redacts is a page that can
  // forget to, and this one used to gate only `subscriptionTier === "none"` —
  // which handed Starter, sold "basic analytics", the full per-listing dataset.
  const analytics = await getHostAnalytics(token, userId);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Analytics"
        description={
          analytics.analyticsScope === "full"
            ? "Application pipeline, invite acceptance rates, and per-listing performance across all your opportunities."
            : "Application pipeline and invite acceptance rates across all your opportunities."
        }
      />
      <HostAnalyticsWorkspace analytics={analytics} />
    </section>
  );
}
