import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getHostApplications,
  getHostListings,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";

import {
  HostApplicantDetail,
  HostSectionHeading,
} from "../../../../../components/host";
import type { DiscoveryListing } from "../../../../../components/discovery";
import { toApplicantItem } from "../applicants-data";
import { StatusActions } from "./StatusActions";
import styles from "../page.module.css";

// Per-host, app-level scoped — never statically cached.
export const dynamic = "force-dynamic";

export default async function HostApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;
  if (!userId || !token) {
    notFound();
  }

  const [applications, listingRows] = await Promise.all([
    getHostApplications(token, userId),
    getHostListings(token).catch(() => []),
  ]);

  // Ownership check: application must belong to one of this host's own listings.
  // Guards against any ownership filter ambiguity in the DB layer.
  const hostListingIds = new Set(listingRows.map((row) => row.id));
  const application = applications.find(
    (entry) => entry.id === id && hostListingIds.has(entry.listingId),
  );
  if (!application) {
    notFound();
  }

  const listingsById = new Map<string, DiscoveryListing>(
    listingRows.map((row): [string, DiscoveryListing] => [
      row.id,
      rowToDiscoveryFields(row),
    ]),
  );
  const applicant = toApplicantItem(application, listingsById);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Applicant detail"
        description="Review this application and the opportunity it targets."
        actionLabel="All applicants"
        actionHref="/host/applicants"
      />
      <HostApplicantDetail applicant={applicant} />
      <StatusActions applicationId={application.id} />
    </section>
  );
}
