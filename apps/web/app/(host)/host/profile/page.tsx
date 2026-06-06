import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getHostApplications,
  getHostListings,
  getHostProfile,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";

import {
  HOST_PROFILE,
  HostProfilePanel,
  HostSectionHeading,
  dbStatusToHostState,
  deriveHostStats,
} from "../../../../components/host";
import type {
  HostApplicantItem,
  HostListingItem,
  HostProfileSummary,
} from "../../../../components/host";
import type { DiscoveryListing } from "../../../../components/discovery";
import { toApplicantItem } from "../applicants/applicants-data";
import styles from "./page.module.css";

// Real host data is per-user and app-level scoped — never statically cached.
export const dynamic = "force-dynamic";

export default async function HostProfilePage() {
  const { userId, getToken } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  const token = await getToken({ template: "supabase" });
  if (!token) {
    redirect("/sign-in");
  }

  const [hostProfile, listingRows, applications] = await Promise.all([
    getHostProfile(token, userId),
    getHostListings(token).catch(() => []),
    getHostApplications(token, userId).catch(() => []),
  ]);

  const listings: HostListingItem[] = listingRows.map((row) => ({
    listing: rowToDiscoveryFields(row),
    state: dbStatusToHostState(row.status),
    applicantCount: 0,
    newApplicantCount: 0,
  }));

  const listingsById = new Map<string, DiscoveryListing>(
    listings.map((item) => [item.listing.id, item.listing]),
  );

  const applicants: HostApplicantItem[] = applications.map((application) =>
    toApplicantItem(application, listingsById),
  );

  // Headline figures derived from real listings + applications. Threads have no
  // real source yet (messaging not built), so unreadMessages stays 0.
  const stats = deriveHostStats(listings, applicants, []);

  // getHostProfile returns only { id }; the company name + verification come
  // from the host_profiles embed on the host's own listings
  // (rowToDiscoveryFields). Fields with no real source yet (contact name,
  // tagline, location, bio) gracefully fall back to the fixture profile.
  const realHost = listings
    .map((item) => item.listing.host)
    .find((host) => host.name && host.name !== "Unknown Host");

  // Safety guard: the host layout already redirects unauthenticated users, so a
  // null profile here means an authed user without an onboarded host profile.
  // Fall back to the fixture profile so the page still renders.
  const profile: HostProfileSummary = hostProfile
    ? {
        ...HOST_PROFILE,
        orgName: realHost?.name ?? HOST_PROFILE.orgName,
        verified: realHost?.verified ?? HOST_PROFILE.verified,
      }
    : HOST_PROFILE;

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Host profile"
        description="How seekers see you across the marketplace."
        actionLabel="Edit profile"
        actionHref="/host/profile/edit"
      />
      <HostProfilePanel profile={profile} stats={stats} />
    </section>
  );
}
