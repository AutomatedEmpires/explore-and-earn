import type { Metadata } from "next";

import {
  BucketPage,
  CardStatus,
  LifecycleList,
  getAcceptedItems,
} from "../../../components/seeker";

export const metadata: Metadata = {
  title: "Accepted",
};

export default async function AcceptedPage() {
  const acceptedItems = await getAcceptedItems();
  return (
    <BucketPage title="Accepted" description="Your confirmed roles and pre-arrival steps.">
      <LifecycleList
        surface="applied"
        items={acceptedItems.map((item) => ({
          listing: item.listing,
          actions: (
            <CardStatus
              icon="category.seasonal"
              label={
                item.travelPlanStatus === "shared"
                  ? "Travel plan shared"
                  : "Plan your arrival"
              }
              detail={`Starts ${item.startDate}`}
            />
          ),
        }))}
        emptyTitle="No accepted roles yet"
        emptyMessage="When you accept an offer, your upcoming role will live here."
      />
    </BucketPage>
  );
}
