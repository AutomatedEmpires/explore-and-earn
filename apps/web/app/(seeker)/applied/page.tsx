import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import {
  getPublicListingById,
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
  const token = userId ? await getToken() : null;

  if (!token) {
    return (
      <BucketPage title="Applied" description="Track the applications you've submitted.">
        <EmptyState
          title="Sign in to see your applications"
          message={SIGN_IN_MESSAGE}
        />
      </BucketPage>
    );
  }

  const applications = await getSeekerApplications(token);

  // TODO(perf): N+1 — each applied listing is fetched individually. Replace with
  // a single batch getPublicListingsByIds(ids) query in @explore-and-earn/db
  // once it exists. Intentionally not implemented in this change.
  const appliedItems: AppliedItem[] = (
    await Promise.all(
      applications.map(
        async (application): Promise<AppliedItem | null> => {
          const row = await getPublicListingById(application.listingId);
          if (!row) {
            return null;
          }
          return {
            listing: rowToDiscoveryFields(row) as DiscoveryListing,
            status: toApplicationStatus(application.status),
            appliedOn: new Date(application.submittedAt).toLocaleDateString(
              "en-US",
              { month: "long", day: "numeric" },
            ),
          };
        },
      ),
    )
  ).filter((item): item is AppliedItem => item !== null);

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
