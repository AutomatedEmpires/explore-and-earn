import type { Metadata } from "next";

import {
  APPLICATION_STATUS_LABEL,
  APPLIED_ITEMS,
  BucketPage,
  CardStatus,
  LifecycleList,
} from "../../../components/seeker";

export const metadata: Metadata = {
  title: "Applied",
};

export default function AppliedPage() {
  return (
    <BucketPage title="Applied" description="Track the applications you've submitted.">
      <LifecycleList
        surface="applied"
        items={APPLIED_ITEMS.map((item) => ({
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
