import type { Metadata } from "next";

import {
  ACCEPTED_ITEMS,
  BucketPage,
  CardStatus,
  LifecycleList,
} from "../../../components/seeker";

export const metadata: Metadata = {
  title: "Accepted",
};

export default function AcceptedPage() {
  return (
    <BucketPage title="Accepted" description="Your confirmed roles and pre-arrival steps.">
      <LifecycleList
        surface="applied"
        items={ACCEPTED_ITEMS.map((item) => ({
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
