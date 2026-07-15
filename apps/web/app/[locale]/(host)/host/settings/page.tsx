import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getHostProfile } from "@explore-and-earn/db";

import { HostSectionHeading } from "../../../../../components/host";
import { HostSettings } from "../../../../../components/host/HostSettings";
import { EngagementNotificationSettings } from "../../../../../components/seeker";
import { EmptyState } from "../../../../../components/discovery";
import { getEngineNotificationSettingsAction } from "../../../../actions/notificationEngine";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function HostSettingsPage() {
  const { userId, getToken } = await auth();
  if (!userId) {
    return (
      <section className={styles.block}>
        <HostSectionHeading title="Settings" description="Manage your account, plan, and team." />
        <EmptyState title="Sign in required" message="Sign in as a host to manage your settings." />
      </section>
    );
  }

  const token = await getToken();
  if (!token) {
    return (
      <section className={styles.block}>
        <HostSectionHeading title="Settings" description="Manage your account, plan, and team." />
        <EmptyState title="Session expired" message="Sign in again to access settings." />
      </section>
    );
  }

  const [hostProfile, engineSettings] = await Promise.all([
    getHostProfile(token, userId),
    getEngineNotificationSettingsAction(),
  ]);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Settings"
        description="Manage your plan, team, account, and support options."
      />
      <HostSettings
        subscriptionTier={hostProfile?.subscriptionTier ?? "none"}
        companyName={hostProfile?.companyName ?? ""}
        hostProfileId={hostProfile?.id ?? null}
      />
      <HostSectionHeading
        title="Notifications"
        description="Choose how we reach you — channels, digests, and quiet hours."
      />
      <EngagementNotificationSettings initial={engineSettings} />
    </section>
  );
}
