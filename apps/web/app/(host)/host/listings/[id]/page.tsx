import { notFound } from "next/navigation";

import {
  HOST_LISTINGS,
  HostListingDetail,
  HostSectionHeading,
  applicantsForListing,
  findHostListing,
} from "../../../../../components/host";
import styles from "./page.module.css";

export function generateStaticParams(): Array<{ id: string }> {
  return HOST_LISTINGS.map((item) => ({ id: item.listing.id }));
}

export default async function HostListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = findHostListing(id);
  if (!item) {
    notFound();
  }

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Listing detail"
        description="Manage status, review the pipeline, and edit the opportunity."
        actionLabel="All listings"
        actionHref="/host/listings"
      />
      <HostListingDetail item={item} applicants={applicantsForListing(id)} />
    </section>
  );
}
