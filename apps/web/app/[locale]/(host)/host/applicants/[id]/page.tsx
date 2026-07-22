import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  canStartApplicationConversation,
  getConversations,
  getHostApplications,
  getHostListings,
  getSeekerDisplayName,
  getSeekerResumeByProfileId,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";

import {
  HostApplicantDetail,
  HostSectionHeading,
} from "../../../../../../components/host";
import type { DiscoveryListing } from "../../../../../../components/discovery";
import { toApplicantItem, threadsByApplicationId } from "../applicants-data";
import { StatusActions } from "./StatusActions";
import { ApplicantResumePopupButton } from "./ApplicantResumePopupButton";
import { OpenConversationButton } from "../../../../../../components/messaging/OpenConversationButton";
import styles from "../page.module.css";
import detailStyles from "./page.module.css";

// Per-host, app-level scoped — never statically cached.
export const metadata: Metadata = { title: "Applicant" };
export const dynamic = "force-dynamic";

export default async function HostApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;
  if (!userId || !token) {
    notFound();
  }

  const [applications, listingRows, conversations] = await Promise.all([
    getHostApplications(token, userId),
    getHostListings(token, userId).catch(() => []),
    getConversations(token, userId, "host").catch(() => []),
  ]);
  const threadsMap = threadsByApplicationId(conversations);

  // Ownership check: application must belong to one of this host's own listings.
  // Guards against any ownership filter ambiguity in the DB layer.
  const hostListingIds = new Set(listingRows.map((row) => row.id));
  const application = applications.find(
    (entry) => entry.id === id && hostListingIds.has(entry.listingId),
  );
  if (!application) {
    notFound();
  }

  // The applicant's name + resume are gated server-side by the same ownership
  // guard (host must own a listing this seeker applied to). Loaded in parallel.
  const [displayName, resume] = await Promise.all([
    getSeekerDisplayName(token, userId, application.seekerProfileId),
    getSeekerResumeByProfileId(token, userId, application.seekerProfileId),
  ]);

  const listingsById = new Map<string, DiscoveryListing>(
    listingRows.map((row): [string, DiscoveryListing] => [
      row.id,
      rowToDiscoveryFields(row),
    ]),
  );
  const applicant = toApplicantItem(application, listingsById, undefined, threadsMap);
  // Prefer the resolved display name in the heading; fall back to the existing
  // pseudonymous handle when no name is available yet.
  const applicantWithName = displayName
    ? { ...applicant, applicantName: displayName }
    : applicant;
  const canStartConversation = canStartApplicationConversation(
    application.status,
  );
  const canOpenConversation =
    Boolean(applicantWithName.threadId) || canStartConversation;

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Applicant detail"
        description="Review this application and the opportunity it targets."
        actionLabel="All applicants"
        actionHref="/host/applicants"
      />
      <ApplicantResumePopupButton
        applicantName={displayName}
        resume={resume}
        applicationId={application.id}
        seekerProfileId={application.seekerProfileId}
        canMessage={canOpenConversation}
      />
      <HostApplicantDetail applicant={applicantWithName} resume={resume} />
      <StatusActions applicationId={application.id} status={application.status} />
      {!applicantWithName.threadId && canStartConversation ? (
        <div className={detailStyles.messageLink}>
          <OpenConversationButton
            role="host"
            seekerProfileId={application.seekerProfileId}
            applicationId={application.id}
            label="Send a message to this applicant"
          />
        </div>
      ) : null}
    </section>
  );
}
