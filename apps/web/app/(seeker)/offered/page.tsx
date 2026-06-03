import {
  BucketPage,
  CardStatus,
  LifecycleList,
  OFFER_ITEMS,
  OFFER_STATE_LABEL,
} from "../../../components/seeker";

export default function OfferedPage() {
  return (
    <BucketPage title="Offered" description="Offers and next steps from hosts.">
      <LifecycleList
        surface="applied"
        items={OFFER_ITEMS.map((item) => ({
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
