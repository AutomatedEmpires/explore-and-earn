import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import {
  getApplicationsForSeekerWithListings,
  type SeekerApplicationWithListing,
} from "@explore-and-earn/db";

import {
  BucketPage,
  LifecycleList,
  OfferedActions,
} from "../../../../components/seeker";
import { EmptyState } from "../../../../components/discovery";
import { seekerApplicationListingToDiscoveryListing } from "../../../../components/discovery/listing";
import {
  DEV_OFFERED_APPLICATION_ID,
  DEV_OFFERED_BEGINS_AT,
  DEV_OFFERED_ENDS_AT,
  OFFER_ITEMS,
} from "../../../../components/seeker/fixtures";
import { isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";

export const metadata: Metadata = {
  title: "Offered",
};

// Per-seeker application data must never be statically cached.
export const dynamic = "force-dynamic";

/**
 * Honest local evidence for the offered bucket. The listing comes from the
 * canonical Orchard fixture while the surrounding record keeps the exact
 * production application shape used by the live query.
 */
function devOfferedApplications(): SeekerApplicationWithListing[] {
  const item = OFFER_ITEMS[0];
  if (!item) {
    throw new Error("Offered page fixture requires an offered item.");
  }

  const { listing } = item;
  return [
    {
      id: DEV_OFFERED_APPLICATION_ID,
      listingId: listing.id,
      status: "offered",
      submittedAt: "2026-05-24T17:00:00.000Z",
      expiresAt: null,
      reviewedAt: null,
      coverMessage: null,
      listing: {
        id: listing.id,
        title: listing.title,
        category: listing.category,
        location: listing.location,
        opportunityWindow: listing.opportunityWindow,
        status: listing.status,
        host: {
          name: listing.host.name,
          verified: listing.host.verified,
        },
        benefits: listing.benefits,
        coverImageUrl: listing.coverImageUrl ?? null,
        beginsAt: DEV_OFFERED_BEGINS_AT,
        endsAt: DEV_OFFERED_ENDS_AT,
        conditionalBadges: listing.conditionalBadges,
        matchScore: listing.matchScore,
      },
    },
  ];
}

export default async function OfferedPage() {
  let offers: SeekerApplicationWithListing[];
  let isDemoFixture = false;

  // Keep the walkthrough fully local: short-circuit before Clerk or DB access.
  if (isDevBenchEnabled() && (await readDevRole()) === "seeker") {
    offers = devOfferedApplications();
    isDemoFixture = true;
  } else {
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

    offers = await getApplicationsForSeekerWithListings(token, userId, [
      "offered",
    ]);
  }

  const items = offers.flatMap((offer) =>
    offer.status === "offered" && offer.listing
      ? [
          {
            listing: seekerApplicationListingToDiscoveryListing(offer.listing),
            cardState: "offered" as const,
            actions: (
              <OfferedActions
                applicationId={offer.id}
                expiresAt={offer.expiresAt}
                detailsHref={`/applied/${offer.id}`}
                subject={offer.listing.title}
                isDemoFixture={isDemoFixture}
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
