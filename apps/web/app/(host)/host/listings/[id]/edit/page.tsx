import { notFound } from "next/navigation";

import {
  HOST_LISTINGS,
  HostSectionHeading,
  ListingForm,
  findHostListing,
  type ListingFormInitialValues,
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

  const initial: ListingFormInitialValues = {
    title: item.listing.title,
    category: item.listing.category,
    location: item.listing.location,
    status: item.state === "draft" ? "draft" : "active",
    triad: item.listing.benefits,
  };

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Edit listing"
        description={`Update ${item.listing.title}.`}
        actionLabel="Back to listing"
        actionHref={`/host/listings/${id}`}
      />
      <ListingForm mode="edit" listingId={item.listing.id} initial={initial} />
    </section>
  );
}
