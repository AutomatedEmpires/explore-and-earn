import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getHostListings,
  getHostApplications,
  getSeekerDisplayNames,
  getPublicListingById,
  rowToDiscoveryFields,
  type HostApplication,
  type ListingRow,
} from "@explore-and-earn/db";

import {
  HostListingDetail,
  HostSectionHeading,
  dbStatusToHostState,
  type ApplicantStage,
  type HostApplicantItem,
  type HostListingItem,
} from "../../../../../../components/host";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Listing" };

// Reads the authed host's RLS-scoped listings; never statically cached.
export const dynamic = "force-dynamic";

/** Map a persisted application status to the host UI applicant stage. */
function applicationStageFromStatus(status: string): ApplicantStage {
  switch (status) {
    case "reviewing":
      return "reviewing";
    case "saved_by_host":
      return "saved_by_host";
    case "offered":
    case "accepted":
      return "offered";
    case "not_selected":
    case "withdrawn":
      return "declined";
    case "applied":
    default:
      return "new";
  }
}

function formatAppliedOn(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export default async function HostListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  // Ownership-first: the host's own RLS-scoped listings include drafts/paused
  // records that the public (live-only) query would hide, and ownership of the
  // row is what authorizes editing. If this listing is the host's own, they may
  // edit it; otherwise fall back to the public live record for a read-only view
  // with edit controls hidden.
  let owned: ListingRow | undefined;
  if (token && userId) {
    try {
      owned = (await getHostListings(token, userId)).find((row) => row.id === id);
    } catch {
      owned = undefined;
    }
  }

  const row = owned ?? (await getPublicListingById(id));
  if (!row) {
    notFound();
  }

  const canEdit = Boolean(owned);
  const listingFields = rowToDiscoveryFields(row);

  // Real applicant data — host-owned view only. The public read-only view does
  // not expose applicant identities.
  let listingApps: HostApplication[] = [];
  let displayNames = new Map<string, string>();
  if (token && userId && owned) {
    try {
      const applications = await getHostApplications(token, userId);
      listingApps = applications.filter((app) => app.listingId === id);
      displayNames = await getSeekerDisplayNames(
        token,
        listingApps.map((app) => app.seekerProfileId),
      );
    } catch {
      listingApps = [];
    }
  }

  const applicantItems: HostApplicantItem[] = listingApps.map((app) => ({
    id: app.id,
    applicantName: displayNames.get(app.seekerProfileId) ?? "Seeker",
    listing: listingFields,
    stage: applicationStageFromStatus(app.status),
    status: app.status,
    appliedOn: formatAppliedOn(app.submittedAt),
    note: app.coverMessage ?? undefined,
  }));

  const newApplicantCount = listingApps.filter(
    (app) => app.status === "applied",
  ).length;

  const item: HostListingItem = {
    listing: listingFields,
    state: dbStatusToHostState(row.status),
    applicantCount: listingApps.length,
    newApplicantCount,
  };

  const recentApplicantItems = applicantItems.slice(0, 5);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Listing detail"
        description="Manage status, review the pipeline, and edit the opportunity."
        actionLabel="All listings"
        actionHref="/host/listings"
      />
      <HostListingDetail item={item} applicants={applicantItems} canEdit={canEdit} />

      {recentApplicantItems.length > 0 ? (
        <div className={styles.recentApplicants}>
          <div className={styles.recentHeader}>
            <h3 className={styles.recentTitle}>Recent applicants</h3>
            <Link
              className={styles.viewAllLink}
              href={`/host/applicants?listingId=${id}`}
            >
              View all
            </Link>
          </div>
          <ol className={styles.recentList}>
            {recentApplicantItems.map((applicant) => (
              <li key={applicant.id} className={styles.recentItem}>
                <Link
                  className={styles.recentLink}
                  href={`/host/applicants/${applicant.id}`}
                >
                  {applicant.applicantName}
                </Link>
                <span className={styles.recentDate}>{applicant.appliedOn}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
