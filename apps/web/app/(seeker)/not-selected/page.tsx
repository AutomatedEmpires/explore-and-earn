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
  title: "Not selected",
};

// Per-seeker application data must never be statically cached.
export const dynamic = "force-dynamic";

export default async function NotSelectedPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <BucketPage
        title="Not selected"
        description="Closure without the noise \u2014 explore similar opportunities."
      >
        <EmptyState
          title="Sign in to see your applications"
          message="Sign in to see the applications that have closed."
        />
      </BucketPage>
    );
  }

  const notSelected = await getSeekerApplicationsWithListings(token, userId, [
    "not_selected",
  ]);
  const items = notSelected.flatMap((application) =>
    application.listing
      ? [
          {
            listing: application.listing,
            actions: <CardStatus icon="system.info" label="Not selected" />,
          },
        ]
      : [],
  );

  return (
    <BucketPage
      title="Not selected"
      description="Closure without the noise \u2014 explore similar opportunities."
    >
      <LifecycleList
        surface="applied"
        items={items}
        emptyTitle="Nothing here"
        emptyMessage="Roles that didn't work out will be listed here, quietly and respectfully. Keep exploring opportunities under Seek."
      />
    </BucketPage>
  );
}
