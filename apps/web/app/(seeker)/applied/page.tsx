import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import {
  getPublicListingsByIds,
  getSeekerApplications,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";

import {
  APPLICATION_STATUS_LABEL,
  BucketPage,
  CardStatus,
  LifecycleList,
  type AppliedItem,
  type ApplicationStatus,
} from "../../../components/seeker";
import { EmptyState, type DiscoveryListing } from "../../../components/discovery";

export const metadata: Metadata = {
  title: "Applied",
};

// Applications are per-seeker and change as they apply, so never statically cache.
export const dynamic = "force-dynamic";

const SIGN_IN_MESSAGE =
  "Once you're signed in, every application you submit will show up here.";

/** Narrow a free-form persisted status string to the local ApplicationStatus union. */
function toApplicationStatus(value: string): ApplicationStatus {
  return value in APPLICATION_STATUS_LABEL
    ? (value as ApplicationStatus)
    : "applied";
}

export default async function AppliedPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <BucketPage title="Applied" description="Track the applications you've submitted.">
        <EmptyState
          title="Sign in to see your applications"
          message={SIGN_IN_MESSAGE}
        />
      </BucketPage>
    );
  }

  const applications = await getSeekerApplications(token, userId);

  // Single batch query for every applied listing (replaces the previous per-id
  // N+1 loop), then join back to each application. `.in(...)` does not preserve
  // order, so we look listings up by id while iterating applications (already
  // newest-first).
  const listingIds = applications.map((application) => application.listingId);
  const rows = await getPublicListingsByIds(listingIds);
  const rowById = new Map(rows.map((row) => [row.id, row] as const));

  const appliedItems: AppliedItem[] = applications
    .map((application): AppliedItem | null => {
      const row = rowById.get(application.listingId);
      if (!row) {
        return null;
      }
      return {
        listing: rowToDiscoveryFields(row) as DiscoveryListing,
        status: toApplicationStatus(application.status),
        appliedOn: application.submittedAt
          ? new Date(application.submittedAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })
          : "Unknown date",
      };
    })
    .filter((item): item is AppliedItem => item !== null);

  return (
    <BucketPage title="Applied" description="Track the applications you've submitted.">
      <LifecycleList
        surface="applied"
        items={appliedItems.map((item) => ({
          listing: item.listing,
          actions: (
            <CardStatus
              icon="action.apply"
              label={APPLICATION_STATUS_LABEL[item.status]}
              detail={`Applied ${item.appliedOn}`}
            />
          ),
        }))}
        emptyTitle="No applications yet"
        emptyMessage="When you apply to an opportunity, it'll show up here."
      />
    </BucketPage>
  );
}
