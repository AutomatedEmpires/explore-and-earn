import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getHostListings,
  getHostApplications,
  getPublicListingById,
  rowToDiscoveryFields,
  type ListingRow,
} from "@explore-and-earn/db";

import {
  HostListingDetail,
  HostSectionHeading,
  dbStatusToHostState,
  type HostListingItem,
} from "../../../../../components/host";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Listing" };

// Reads the authed host's RLS-scoped listings; never statically cached.
export const dynamic = "force-dynamic";

function toItem(row: ListingRow): HostListingItem {
  return {
    listing: rowToDiscoveryFields(row),
    state: dbStatusToHostState(row.status),
    // TODO(host-applicants): real applicant counts land in the next backend PR.
    applicantCount: 0,
    newApplicantCount: 0,
  };
}

export default async function HostListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

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

  const item = toItem(row);
  const canEdit = Boolean(owned);

  // Top 5 most recent applicants for this listing (host-owned view only).
  let recentApplicantItems: Array<{ id: string; name: string; appliedOn: string }> = [];
  if (token && userId && owned) {
    try {
      const applications = await getHostApplications(token, userId);
      const listingApps = applications
        .filter((app) => app.listingId === id)
        .slice(0, 5);
      recentApplicantItems = listingApps.map((app) => {
        const raw = app.seekerClerkUserId || app.seekerProfileId || "";
        const short = raw.replace(/^user_/, "").slice(0, 8);
        const name = short ? `Applicant ${short}` : "Applicant";
        const date = new Date(app.submittedAt);
        const appliedOn = Number.isNaN(date.getTime())
          ? app.submittedAt
          : date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
        return { id: app.id, name, appliedOn };
      });
    } catch {
      recentApplicantItems = [];
    }
  }

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Listing detail"
        description="Manage status, review the pipeline, and edit the opportunity."
        actionLabel="All listings"
        actionHref="/host/listings"
      />
      <HostListingDetail item={item} applicants={[]} canEdit={canEdit} />

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
                  {applicant.name}
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
