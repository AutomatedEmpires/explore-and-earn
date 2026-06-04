import type { Metadata } from "next";

import {
  BucketPage,
  CardStatus,
  LifecycleList,
  getNotSelectedItems,
} from "../../../components/seeker";

export const metadata: Metadata = {
  title: "Not selected",
};

export default async function NotSelectedPage() {
  const notSelectedItems = await getNotSelectedItems();
  return (
    <BucketPage
      title="Not selected"
      description="Closure without the noise \u2014 explore similar opportunities."
    >
      <LifecycleList
        surface="applied"
        items={notSelectedItems.map((item) => ({
          listing: item.listing,
          actions: (
            <CardStatus
              icon="system.info"
              label="Not selected"
              detail={`Closed ${item.closedOn}`}
            />
          ),
        }))}
        emptyTitle="Nothing here"
        emptyMessage="Roles that didn't work out will be listed here, quietly and respectfully."
      />
    </BucketPage>
  );
}
