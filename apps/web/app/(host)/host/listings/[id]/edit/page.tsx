import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { getHostListings, getHostProfile } from "@explore-and-earn/db";
import type { CompensationUnit } from "@explore-and-earn/contracts";

import {
  HostSectionHeading,
  ListingForm,
  type ListingFormInitialValues,
} from "../../../../../../components/host";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Edit listing" };
export const dynamic = "force-dynamic";

function centsToInput(cents: number | null): string | undefined {
  if (cents == null) return undefined;
  return String(cents / 100);
}

export default async function HostListingEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId, getToken } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  const token = await getToken({ template: "supabase" });
  if (!token) {
    redirect("/sign-in");
  }

  const [listings, hostProfile] = await Promise.all([
    getHostListings(token, userId),
    getHostProfile(token, userId).catch(() => null),
  ]);
  const listing = listings.find((row) => row.id === id);
  if (!listing) {
    notFound();
  }

  const initial: ListingFormInitialValues = {
    title: listing.title,
    category: listing.category,
    locationName: listing.location_display ?? undefined,
    summary: listing.description ?? undefined,
    // Hydrate every field the form submits — otherwise a blank field re-saves as
    // empty and wipes the stored value (housing/meals flipping included→false,
    // the gallery emptying, the end date dropping).
    housingDescription: listing.housing_description ?? undefined,
    mealsDescription: listing.meals_description ?? undefined,
    payMin: centsToInput(listing.compensation_min_cents),
    payMax: centsToInput(listing.compensation_max_cents),
    payPeriod: listing.compensation_unit
      ? (listing.compensation_unit as CompensationUnit)
      : undefined,
    startDate: listing.begins_at ? listing.begins_at.slice(0, 10) : undefined,
    endDate: listing.ends_at ? listing.ends_at.slice(0, 10) : undefined,
    coverPhotoUrl: listing.cover_photo_url ?? undefined,
    galleryUrls: listing.gallery_photo_urls ?? undefined,
  };

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Edit listing"
        description={`Update ${listing.title}.`}
        actionLabel="Back to listing"
        actionHref={`/host/listings/${id}`}
      />
      <ListingForm
        mode="edit"
        listingId={id}
        initial={initial}
        hostProfileId={hostProfile?.id}
      />
    </section>
  );
}
