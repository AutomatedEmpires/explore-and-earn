import type { Metadata } from "next";

import {
  APPLICATION_STATUS_LABEL,
  BucketPage,
  CardStatus,
  LifecycleList,
  getAppliedItems,
} from "../../../components/seeker";

export const metadata: Metadata = {
  title: "Applied",
};

export default async function AppliedPage() {
  const appliedItems = await getAppliedItems();
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
