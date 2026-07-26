import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import {
  INVITABLE_TEAM_ROLES,
  effectiveListingCap,
  getHostProfile,
  getHostTeam,
  getPurchasedListingSlots,
  includedListingCapFor,
  seatLimitForTier,
} from "@explore-and-earn/db";

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

  const [hostProfile, engineSettings, t] = await Promise.all([
    getHostProfile(token, userId),
    getEngineNotificationSettingsAction(),
    getTranslations("Notifications.settings"),
  ]);

  const subscriptionTier = hostProfile?.subscriptionTier ?? "none";

  // Team + add-on state. Both degrade rather than throw: a host must still be
  // able to reach billing and account settings if migration 085 has not landed
  // on this environment yet.
  const [team, purchasedListingSlots] = await Promise.all([
    getHostTeam(token, userId, subscriptionTier).catch(() => null),
    getPurchasedListingSlots(token).catch(() => 0),
  ]);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Settings"
        description="Manage your plan, team, account, and support options."
      />
      <HostSettings
        subscriptionTier={subscriptionTier}
        companyName={hostProfile?.companyName ?? ""}
        hostProfileId={hostProfile?.id ?? null}
        teamMembers={team?.members ?? []}
        teamSeats={
          team?.seats ?? {
            limit: seatLimitForTier(subscriptionTier),
            used: 0,
            remaining: 0,
          }
        }
        teamAvailable={team?.available ?? false}
        invitableRoles={INVITABLE_TEAM_ROLES}
        purchasedListingSlots={purchasedListingSlots}
        includedListingCap={includedListingCapFor(subscriptionTier)}
        effectiveListingCap={effectiveListingCap(subscriptionTier, purchasedListingSlots)}
      />
      <HostSectionHeading title={t("heading")} description={t("description")} />
      <EngagementNotificationSettings initial={engineSettings} />
    </section>
  );
}
