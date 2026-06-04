import type { Metadata } from "next";

import {
  BucketPage,
  CardStatus,
  LifecycleList,
  OFFER_STATE_LABEL,
  getOfferItems,
} from "../../../components/seeker";

export const metadata: Metadata = {
  title: "Offered",
};

export default async function OfferedPage() {
  const offerItems = await getOfferItems();
  return (
    <BucketPage title="Offered" description="Offers and next steps from hosts.">
      <LifecycleList
        surface="applied"
        items={offerItems.map((item) => ({
          listing: item.listing,
          actions: (
            <CardStatus
              icon="status.match"
              label={OFFER_STATE_LABEL[item.state]}
              detail={item.expiresOn ? `Respond by ${item.expiresOn}` : undefined}
            />
          ),
        }))}
        emptyTitle="No offers yet"
        emptyMessage="Offers from hosts will appear here once you start applying."
      />
    </BucketPage>
  );
}
