import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import {
  countHostAnnouncementsThisMonth,
  getHostTierAndProfile,
} from "@explore-and-earn/db";

import { EmptyState } from "../../../../components/discovery";
import { HostSectionHeading } from "../../../../components/host";
import { HostAnnouncementComposer } from "../../../../components/host/HostAnnouncementComposer";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Announcements" };

const PAGE_DESCRIPTION =
  "Post a community announcement — a hiring push, event, or update that reaches seekers across Explore & Earn.";

function SignInState() {
  return (
    <section className={styles.block}>
      <HostSectionHeading title="Announcements" description={PAGE_DESCRIPTION} />
      <EmptyState
        title="Sign in as a host"
        message="Your announcement composer will show up here."
      />
    </section>
  );
}

export default async function HostAnnouncementsPage() {
  const { userId, getToken } = await auth();
  if (!userId) return <SignInState />;

  const token = await getToken({ template: "supabase" });
  if (!token) return <SignInState />;

  const hostIdentity = await getHostTierAndProfile(token, userId).catch(() => null);
  if (!hostIdentity) {
    return (
      <section className={styles.block}>
        <HostSectionHeading title="Announcements" description={PAGE_DESCRIPTION} />
        <EmptyState
          title="Set up your host profile first"
          message="Create your host profile, then post announcements to reach seekers."
        />
      </section>
    );
  }

  let usedThisMonth = 0;
  try {
    usedThisMonth = await countHostAnnouncementsThisMonth(
      token,
      hostIdentity.hostProfileId,
    );
  } catch {
    // Degrade gracefully — the composer still renders with 0 used.
  }

  return (
    <section className={styles.block}>
      <HostSectionHeading title="Announcements" description={PAGE_DESCRIPTION} />
      <HostAnnouncementComposer
        subscriptionTier={hostIdentity.subscriptionTier}
        usedThisMonth={usedThisMonth}
        draftAnnouncementId={null}
      />
    </section>
  );
}
