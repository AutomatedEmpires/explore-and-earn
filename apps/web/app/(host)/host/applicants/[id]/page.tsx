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
  const token = userId ? await getToken() : null;
  if (!userId || !token) {
    notFound();
  }

  const [applications, listingRows] = await Promise.all([
    getHostApplications(token, userId),
    getHostListings(token).catch(() => []),
  ]);

  // The applicant id in the route is the application id. Scoping getHostApplications
  // to this host means a non-owned id simply will not be found -> 404.
  const application = applications.find((entry) => entry.id === id);
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
    </section>
  );
}
