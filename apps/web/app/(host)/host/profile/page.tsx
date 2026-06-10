import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getHostApplications,
  getHostListings,
  getHostProfile,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";

import {
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
export const metadata: Metadata = { title: "Host profile" };
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
    getHostListings(token, userId).catch(() => []),
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

  // company name + verification come from the host_profiles embed on the host's
  // own listings (rowToDiscoveryFields); about + location come straight from the
  // host_profiles row. Contact name + tagline have no backing column yet, so
  // the page uses neutral placeholders instead of sample fixture content.
  const realHost = listings
    .map((item) => item.listing.host)
    .find((host) => host.name && host.name !== "Unknown Host");

  const profile: HostProfileSummary = hostProfile
    ? {
        hostName: "Host",
        orgName: realHost?.name ?? hostProfile.companyName ?? "Your organization",
        location: hostProfile.primaryLocationName ?? undefined,
        bio: hostProfile.about ?? undefined,
        verified: realHost?.verified ?? false,
      }
    : {
        hostName: "Host",
        orgName: realHost?.name ?? "Your organization",
        verified: realHost?.verified ?? false,
      };

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
