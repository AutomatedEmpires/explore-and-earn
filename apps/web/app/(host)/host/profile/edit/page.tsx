import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getHostListings,
  getHostProfile,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";

import {
  HostProfileForm,
  HostSectionHeading,
} from "../../../../../components/host";
import type { HostProfileSummary } from "../../../../../components/host";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Edit profile" };

// Real host data is per-user and app-level scoped \u2014 never statically cached.
export const dynamic = "force-dynamic";

export default async function HostProfileEditPage() {
  const { userId, getToken } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  const token = await getToken({ template: "supabase" });
  if (!token) {
    redirect("/sign-in");
  }

  const [hostProfile, listingRows] = await Promise.all([
    getHostProfile(token, userId),
    getHostListings(token, userId).catch(() => []),
  ]);

  // Company name + verification come from the host_profiles embed on the host's
  // own listings (same merge the profile page uses). About + location come from
  // the host_profiles row. Host name + tagline have no backing column yet, so
  // they are left blank and rendered read-only in the form.
  const realHost = listingRows
    .map((row) => rowToDiscoveryFields(row).host)
    .find((host) => host.name && host.name !== "Unknown Host");

  const profile: HostProfileSummary = {
    hostName: "",
    orgName: realHost?.name ?? hostProfile?.companyName ?? "",
    location: hostProfile?.primaryLocationName ?? undefined,
    bio: hostProfile?.about ?? undefined,
    verified: realHost?.verified ?? false,
  };

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Edit profile"
        description="Update how seekers see you across the marketplace."
        actionLabel="Back to profile"
        actionHref="/host/profile"
      />
      <HostProfileForm
        profile={profile}
        hostProfileId={hostProfile?.id}
        photoUrl={hostProfile?.photoUrl ?? undefined}
      />
    </section>
  );
}
