import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import {
  getHostApplications,
  getHostListings,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";

import { HostPipelineBoard, HostSectionHeading } from "../../../../components/host";
import { EmptyState, type DiscoveryListing } from "../../../../components/discovery";
import { toApplicantItem } from "./applicants-data";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Applicants" };

// Applicants are per-host (app-level scoped) and must never be statically cached.
export const dynamic = "force-dynamic";

export default async function HostApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<{ listingId?: string }>;
}) {
  const { listingId: filterListingId } = await searchParams;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  // Unauthenticated (or no session token): graceful fallback. The (host) route
  // group is also middleware-protected, so this is belt-and-braces.
  if (!userId || !token) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          title="Applicants"
          description="Sign in as a host to review the people applying to your opportunities."
        />
        <EmptyState
          title="Sign in to review applicants"
          message="You need to be signed in as a host to see who has applied to your listings."
        />
      </section>
    );
  }

  // Applications carry only listingId/listingTitle; load the host's listings to
  // resolve each application's full DiscoveryListing for the canonical card.
  const [applications, listingRows] = await Promise.all([
    getHostApplications(token, userId),
    getHostListings(token, userId).catch(() => []),
  ]);

  const listingsById = new Map<string, DiscoveryListing>(
    listingRows.map((row): [string, DiscoveryListing] => [
      row.id,
      rowToDiscoveryFields(row),
    ]),
  );
  // Defense-in-depth: only show applications for listings we can confirm belong
  // to this host (present in listingsById). Guards against any ownership filter
  // ambiguity in the DB layer.
  const hostListingIds = new Set(listingRows.map((row) => row.id));
  const ownedApplications = applications.filter((application) =>
    hostListingIds.has(application.listingId),
  );

  // Optional listingId query param — filter to a single listing.
  const filteredApplications = filterListingId
    ? ownedApplications.filter(
        (application) => application.listingId === filterListingId,
      )
    : ownedApplications;

  const applicants = filteredApplications.map((application) =>
    toApplicantItem(application, listingsById),
  );

  const filterListing = filterListingId
    ? listingsById.get(filterListingId)
    : undefined;
  const filterTitle = filterListing?.title ?? filterListingId;

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title={filterListingId ? `Applicants — ${filterTitle}` : "Applicants"}
        description={
          filterListingId
            ? "Applicants for this listing, grouped by stage."
            : "Your applicant pipeline across all listings, grouped by stage."
        }
        {...(filterListingId
          ? { actionLabel: "All applicants", actionHref: "/host/applicants" }
          : {})}
      />
      {applicants.length > 0 ? (
        <HostPipelineBoard applicants={applicants} />
      ) : (
        <EmptyState
          title="No applicants yet"
          message={
            filterListingId
              ? "No applicants for this listing yet."
              : "When seekers apply to your listings, their applications will appear here, grouped by stage for review."
          }
        />
      )}
    </section>
  );
}
