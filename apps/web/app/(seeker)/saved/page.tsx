import {
  BucketPage,
  CardStatus,
  LifecycleList,
  SAVED_ITEMS,
} from "../../../components/seeker";

export default function SavedPage() {
  return (
    <BucketPage title="Saved" description="Opportunities you want to revisit.">
      <LifecycleList
        surface="saved"
        items={SAVED_ITEMS.map((item) => ({
          listing: item.listing,
          actions: <CardStatus icon="nav.saved" label="Saved" detail={item.note} />,
        }))}
        emptyTitle="Nothing saved yet"
        emptyMessage="Tap save on any opportunity to keep it here for later."
      />
    </BucketPage>
  );
}
