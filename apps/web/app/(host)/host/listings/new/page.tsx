import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { HostSectionHeading, ListingForm } from "../../../../../components/host";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "New listing" };

export const dynamic = "force-dynamic";

export default async function HostNewListingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="New listing"
        description="Draft a new opportunity to share with seekers."
        actionLabel="All listings"
        actionHref="/host/listings"
      />
      <ListingForm mode="create" />
    </section>
  );
}
