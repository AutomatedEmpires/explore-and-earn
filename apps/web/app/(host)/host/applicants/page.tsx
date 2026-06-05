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

// Applicants are per-host (app-level scoped) and must never be statically cached.
export const dynamic = "force-dynamic";

export default async function HostApplicantsPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

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
    getHostListings(token).catch(() => []),
  ]);

  const listingsById = new Map<string, DiscoveryListing>(
    listingRows.map((row): [string, DiscoveryListing] => [
      row.id,
      rowToDiscoveryFields(row),
    ]),
  );
  const applicants = applications.map((application) =>
    toApplicantItem(application, listingsById),
  );

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Applicants"
        description="Your applicant pipeline, grouped by stage. Review only — moving applicants between stages activates with the hiring pipeline."
      />
      {applicants.length > 0 ? (
        <HostPipelineBoard applicants={applicants} />
      ) : (
        <EmptyState
          title="No applicants yet"
          message="When seekers apply to your listings, their applications will appear here, grouped by stage for review."
        />
      )}
    </section>
  );
}
