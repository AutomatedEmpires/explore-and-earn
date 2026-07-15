import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { hasVerifiedHostSubscription } from "@explore-and-earn/contracts";

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

  // Prefer the listing embed only for a marketplace-tested organization name;
  // every editable profile field otherwise comes straight from host_profiles so
  // the owner preview and edit form describe the same persisted public identity.
  // Verification is read from the subscription tier and remains independent of
  // profile readiness.
  const realHost = listings
    .map((item) => item.listing.host)
    .find((host) => host.name && host.name !== "Unknown Host");
  const verified = hasVerifiedHostSubscription(hostProfile?.subscriptionTier);

  const profile: HostProfileSummary = hostProfile
    ? {
        hostName: hostProfile.hostName ?? hostProfile.companyName ?? "Host",
        orgName: realHost?.name ?? hostProfile.companyName ?? "Your organization",
        tagline: hostProfile.tagline ?? undefined,
        location: hostProfile.primaryLocationName ?? undefined,
        bio: hostProfile.about ?? undefined,
        photoUrl: hostProfile.photoUrl ?? undefined,
        verified,
        websiteUrl: hostProfile.websiteUrl ?? undefined,
        instagram: hostProfile.socialLinks.instagram ?? undefined,
        twitter: hostProfile.socialLinks.twitter ?? undefined,
        housingOfferedGenerally: hostProfile.housingOfferedGenerally,
        mealsOfferedGenerally: hostProfile.mealsOfferedGenerally,
        categoryScopes: hostProfile.categoryScopes,
      }
    : {
        hostName: realHost?.name ?? "Host",
        orgName: realHost?.name ?? "Your organization",
        verified,
      };

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Host profile"
        description="How seekers see you across the marketplace."
        actionLabel="Edit profile"
        actionHref="/host/profile/edit"
      />
      <HostProfilePanel
        profile={profile}
        stats={stats}
        readinessProfile={hostProfile}
      />
    </section>
  );
}
