import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  analyticsScopeForTier,
  canStartApplicationConversation,
  getConversations,
  getHostApplications,
  getHostListings,
  getHostSubscriptionTier,
  getMatchScoresForHost,
  getSchedulingRequestForApplication,
  getSeekerDisplayName,
  getSeekerProfileForHost,
  getSeekerResumeByProfileId,
  rowToDiscoveryFields,
  singleSeekerName,
} from "@explore-and-earn/db";

import {
  HostApplicantDetail,
  HostSectionHeading,
} from "../../../../../../components/host";
import type { DiscoveryListing } from "../../../../../../components/discovery";
import { CaptureOnMount } from "../../../../../../components/analytics/FunnelEvents";
import { HOST_WORKSPACE_EVENTS } from "../../../../../../lib/analytics/events";
import { isUuid } from "../../../../../../lib/ids";
import { toApplicantItem, threadsByApplicationId } from "../applicants-data";
import { StatusActions } from "./StatusActions";
import { ApplicantResumePopupButton } from "./ApplicantResumePopupButton";
import { OpenConversationButton } from "../../../../../../components/messaging/OpenConversationButton";
import { HostInterviewScheduler } from "../../../../../../components/scheduling/HostInterviewScheduler";
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
  if (!isUuid(id)) {
    notFound();
  }

  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;
  if (!userId || !token) {
    notFound();
  }

  const [
    applications,
    listingRows,
    conversations,
    matchScores,
    subscriptionTier,
    scheduling,
  ] =
    await Promise.all([
      getHostApplications(token, userId),
      getHostListings(token, userId).catch(() => []),
      getConversations(token, userId, "host").catch(() => []),
      getMatchScoresForHost(token).catch(() => new Map()),
      getHostSubscriptionTier(token, userId).catch(() => "none" as const),
      getSchedulingRequestForApplication(token, id),
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

  // The applicant's name, resume and profile are entitlement-checked in the
  // database (migration 084): host identity comes from the JWT, and rows come
  // back only for a seeker related to this host. Loaded in parallel.
  //
  // The three reads fail differently on purpose. The RESUME is this page: if
  // that read faults, getSeekerResumeByProfileId throws and the request fails
  // loudly, because a blank resume shown as though it were the applicant's is
  // the exact lie 084 exists to remove. The NAME is a heading, so its lookup
  // reports a fault as data and the heading falls back to the pseudonymous
  // handle. The PROFILE decorates a fact strip whose every row is conditional,
  // so a fault there simply removes rows that were never guaranteed.
  const [nameLookup, resume, profile] = await Promise.all([
    getSeekerDisplayName(token, application.seekerProfileId),
    getSeekerResumeByProfileId(token, application.seekerProfileId),
    getSeekerProfileForHost(token, application.seekerProfileId).catch(() => null),
  ]);
  if (nameLookup.status === "unavailable") {
    console.error("[host/applicants/id] applicant name lookup failed:", nameLookup.reason);
  }
  const displayName = singleSeekerName(nameLookup, application.seekerProfileId);

  const listingsById = new Map<string, DiscoveryListing>(
    listingRows.map((row): [string, DiscoveryListing] => [
      row.id,
      rowToDiscoveryFields(row),
    ]),
  );
  const applicant = toApplicantItem(
    application,
    listingsById,
    undefined,
    threadsMap,
    matchScores,
  );
  // Prefer the resolved display name in the heading; fall back to the existing
  // pseudonymous handle when no name is available yet.
  const applicantWithName = displayName
    ? { ...applicant, applicantName: displayName }
    : applicant;
  const canStartConversation = canStartApplicationConversation(application.status);
  const canOpenConversation =
    Boolean(applicantWithName.threadId) || canStartConversation;
  const showMatch = analyticsScopeForTier(subscriptionTier) === "full";

  return (
    <section className={styles.block}>
      <HostSectionHeading
        level={1}
        eyebrow="Candidate"
        title={applicantWithName.applicantName}
        description="Everything this seeker has shared with you, and the decision controls."
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
      <HostApplicantDetail
        applicant={applicantWithName}
        resume={resume}
        profile={profile}
        showMatch={showMatch}
        actions={
          <>
            <HostInterviewScheduler
              applicationId={application.id}
              applicationStatus={application.status}
              available={scheduling.available}
              request={scheduling.request}
            />
            <StatusActions applicationId={application.id} status={application.status} />
            {!applicantWithName.threadId && canStartConversation ? (
              <div className={detailStyles.messageLink}>
                <OpenConversationButton
                  role="host"
                  seekerProfileId={application.seekerProfileId}
                  applicationId={application.id}
                  label="Send a message"
                />
              </div>
            ) : null}
          </>
        }
      />
      {/* A candidate was actually opened. No id, no name, no score — the event
          says a review happened, not who it was about. */}
      <CaptureOnMount event={HOST_WORKSPACE_EVENTS.candidateReviewed} />
    </section>
  );
}
