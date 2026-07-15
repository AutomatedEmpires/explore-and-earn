import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getHostProfile } from "@explore-and-earn/db";

import { HostSectionHeading } from "../../../../components/host";
import { HostSettings } from "../../../../components/host/HostSettings";
import { EmptyState } from "../../../../components/discovery";
import { devHostProfile } from "../../../../lib/devBench";
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

  const token = await getToken({ template: "supabase" });
  if (!token) {
    return (
      <section className={styles.block}>
        <HostSectionHeading title="Settings" description="Manage your account, plan, and team." />
        <EmptyState title="Session expired" message="Sign in again to access settings." />
      </section>
    );
  }

  const hasDataConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!hasDataConfig && process.env.NODE_ENV === "production") {
    throw new Error("Host settings require the configured Supabase environment.");
  }

  const hostProfile = hasDataConfig
    ? await getHostProfile(token, userId)
    : devHostProfile();

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
    </section>
  );
}
