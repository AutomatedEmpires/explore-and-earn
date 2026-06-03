import {
  BucketPage,
  CardStatus,
  LifecycleList,
  NOT_SELECTED_ITEMS,
} from "../../../components/seeker";

export default function NotSelectedPage() {
  return (
    <BucketPage
      title="Not selected"
      description="Closure without the noise — explore similar opportunities."
    >
      <LifecycleList
        surface="applied"
        items={NOT_SELECTED_ITEMS.map((item) => ({
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
