import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import {
  countHostAnnouncementsThisMonth,
  getHostOwnAnnouncements,
  getHostTierAndProfile,
  getLatestDraftAnnouncement,
  type HostOwnAnnouncement,
} from "@explore-and-earn/db";

import { EmptyState } from "../../../../../components/discovery";
import {
  HostAnnouncementHistory,
  HostAnnouncementPerformance,
  HostSectionHeading,
} from "../../../../../components/host";
import { HostAnnouncementComposer } from "../../../../../components/host/HostAnnouncementComposer";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Announcements" };

const PAGE_DESCRIPTION =
  "A hiring push, a housing update, a closing date — sent to seekers across the marketplace.";

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

  const token = await getToken();
  if (!token) return <SignInState />;

  const hostIdentity = await getHostTierAndProfile(token, userId).catch(() => null);
  if (!hostIdentity) {
    return (
      <section className={styles.block}>
        <HostSectionHeading title="Announcements" description={PAGE_DESCRIPTION} />
        <EmptyState
          title="Set up your host profile first"
          message="Create your host profile, then post announcements to reach seekers."
          actionLabel="Create your profile"
          actionHref="/host/profile/edit"
        />
      </section>
    );
  }

  /*
   * Three reads, three different failure postures.
   *
   * The USAGE COUNT and the HISTORY degrade: a composer that renders with a
   * stale allowance is still useful, and the database refuses an over-quota
   * post anyway (083's advisory-locked RPC), so the client-side number is a
   * courtesy rather than the enforcement.
   *
   * The DRAFT LOOKUP matters more than either. Before this release the page
   * passed `draftAnnouncementId={null}` unconditionally, which meant a host who
   * paid $149 was shown the composer's purchase state and had NO route to the
   * run they had already bought. Wiring it is the point of the read.
   */
  const [usedThisMonth, announcements, draftAnnouncementId] = await Promise.all([
    countHostAnnouncementsThisMonth(token, hostIdentity.hostProfileId).catch(
      () => 0,
    ),
    getHostOwnAnnouncements(token, hostIdentity.hostProfileId).catch(
      () => [] as HostOwnAnnouncement[],
    ),
    getLatestDraftAnnouncement(token, hostIdentity.hostProfileId).catch(
      () => null,
    ),
  ]);

  return (
    <section className={styles.block}>
      <HostSectionHeading title="Announcements" description={PAGE_DESCRIPTION} />

      <HostAnnouncementComposer
        subscriptionTier={hostIdentity.subscriptionTier}
        usedThisMonth={usedThisMonth}
        draftAnnouncementId={draftAnnouncementId}
      />

      <section className={styles.section} aria-label="Your announcements">
        <h2 className={styles.sectionTitle}>Your announcements</h2>
        <HostAnnouncementHistory announcements={announcements} />
      </section>

      <HostAnnouncementPerformance />
    </section>
  );
}
