import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getHostProfile } from "@explore-and-earn/db";

import { HostSectionHeading, ListingForm } from "../../../../../components/host";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "New listing" };

export const dynamic = "force-dynamic";

export default async function HostNewListingPage() {
  const { userId, getToken } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  const token = await getToken();
  if (!token) {
    redirect("/sign-in");
  }

  const hostProfile = await getHostProfile(token, userId).catch(() => null);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="New listing"
        description="Draft a new opportunity to share with seekers."
        actionLabel="All listings"
        actionHref="/host/listings"
      />
      {hostProfile == null && (
        <p className={styles.profileNotice}>
          Your host profile is still setting up. Complete your{" "}
          <a href="/host/profile/edit">host profile</a> first, then return here
          to create a listing.
        </p>
      )}
      <ListingForm mode="create" hostProfileId={hostProfile?.id} />
    </section>
  );
}
