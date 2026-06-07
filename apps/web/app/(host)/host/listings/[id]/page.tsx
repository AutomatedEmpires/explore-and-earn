import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getHostListings,
  getPublicListingById,
  rowToDiscoveryFields,
  type ListingRow,
} from "@explore-and-earn/db";

import {
  HostListingDetail,
  HostSectionHeading,
  dbStatusToHostState,
  type HostListingItem,
} from "../../../../../components/host";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Listing" };

// Reads the authed host's RLS-scoped listings; never statically cached.
export const dynamic = "force-dynamic";

function toItem(row: ListingRow): HostListingItem {
  return {
    listing: rowToDiscoveryFields(row),
    state: dbStatusToHostState(row.status),
    // TODO(host-applicants): real applicant counts land in the next backend PR.
    applicantCount: 0,
    newApplicantCount: 0,
  };
}

export default async function HostListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  // Ownership-first: the host's own RLS-scoped listings include drafts/paused
  // records that the public (live-only) query would hide, and ownership of the
  // row is what authorizes editing. If this listing is the host's own, they may
  // edit it; otherwise fall back to the public live record for a read-only view
  // with edit controls hidden.
  let owned: ListingRow | undefined;
  if (token && userId) {
    try {
      owned = (await getHostListings(token, userId)).find((row) => row.id === id);
    } catch {
      owned = undefined;
    }
  }

  const row = owned ?? (await getPublicListingById(id));
  if (!row) {
    notFound();
  }

  const item = toItem(row);
  const canEdit = Boolean(owned);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Listing detail"
        description="Manage status, review the pipeline, and edit the opportunity."
        actionLabel="All listings"
        actionHref="/host/listings"
      />
      <HostListingDetail item={item} applicants={[]} canEdit={canEdit} />
    </section>
  );
}
