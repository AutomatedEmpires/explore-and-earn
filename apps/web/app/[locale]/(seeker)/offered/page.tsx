import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { getSeekerApplicationsWithListings } from "@explore-and-earn/db";

import {
  BucketPage,
  LifecycleList,
  OfferedActions,
} from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";

export const metadata: Metadata = {
  title: "Offered",
};

// Per-seeker application data must never be statically cached.
export const dynamic = "force-dynamic";

export default async function OfferedPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
    return (
      <BucketPage title="Offered" description="Offers and next steps from hosts.">
        <EmptyState
          title="Sign in to see your offers"
          message="Sign in to see offers and next steps from hosts."
        />
      </BucketPage>
    );
  }

  const offers = await getSeekerApplicationsWithListings(token, userId, [
    "offered",
  ]);
  const items = offers.flatMap((offer) =>
    offer.listing
      ? [
          {
            listing: offer.listing,
            cardState: "offered" as const,
            actions: (
              <OfferedActions
                applicationId={offer.id}
                expiresAt={offer.expiresAt}
              />
            ),
          },
        ]
      : [],
  );

  return (
    <BucketPage title="Offered" description="Offers and next steps from hosts.">
      <LifecycleList
        surface="offered"
        items={items}
        emptyIllustration="empty.offers"
        emptyTitle="No offers yet"
        emptyMessage="Offers from hosts will appear here once you start applying. Keep exploring opportunities under Seek."
        emptyActionLabel="Explore opportunities"
        emptyActionHref="/seek"
      />
    </BucketPage>
  );
}
