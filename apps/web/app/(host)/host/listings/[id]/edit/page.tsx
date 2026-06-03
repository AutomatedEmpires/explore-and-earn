import { notFound } from "next/navigation";

import {
  HOST_LISTINGS,
  HostListingForm,
  HostSectionHeading,
  findHostListing,
} from "../../../../../../components/host";
import styles from "./page.module.css";

export function generateStaticParams(): Array<{ id: string }> {
  return HOST_LISTINGS.map((item) => ({ id: item.listing.id }));
}

export default async function HostListingEditPage({
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
        title="Edit listing"
        description={`Update ${item.listing.title}.`}
        actionLabel="Back to listing"
        actionHref={`/host/listings/${id}`}
      />
      <HostListingForm mode="edit" item={item} />
    </section>
  );
}
