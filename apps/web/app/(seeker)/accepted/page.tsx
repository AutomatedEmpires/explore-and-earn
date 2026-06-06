import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { getSeekerApplicationsWithListings } from "@explore-and-earn/db";

import {
  BucketPage,
  CardStatus,
  LifecycleList,
} from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";

export const metadata: Metadata = {
  title: "Accepted",
};

// Per-seeker application data must never be statically cached.
export const dynamic = "force-dynamic";

export default async function AcceptedPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <BucketPage
        title="Accepted"
        description="Your confirmed roles and pre-arrival steps."
      >
        <EmptyState
          title="Sign in to see your accepted roles"
          message="Sign in to see your confirmed roles and pre-arrival steps."
        />
      </BucketPage>
    );
  }

  const accepted = await getSeekerApplicationsWithListings(token, userId, [
    "accepted",
  ]);
  const items = accepted.flatMap((application) =>
    application.listing
      ? [
          {
            listing: application.listing,
            actions: (
              <CardStatus icon="category.seasonal" label="Accepted" />
            ),
          },
        ]
      : [],
  );

  return (
    <BucketPage
      title="Accepted"
      description="Your confirmed roles and pre-arrival steps."
    >
      <LifecycleList
        surface="applied"
        items={items}
        emptyTitle="No accepted roles yet"
        emptyMessage="When you accept an offer, your upcoming role will live here. Keep exploring opportunities under Seek."
      />
    </BucketPage>
  );
}
