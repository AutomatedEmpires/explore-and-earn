import {
  BucketPage,
  CardStatus,
  INVITE_ITEMS,
  INVITE_STATE_LABEL,
  LifecycleList,
} from "../../../components/seeker";

export default function InvitesPage() {
  return (
    <BucketPage title="Invites" description="Hosts who invited you to apply.">
      <LifecycleList
        surface="saved"
        items={INVITE_ITEMS.map((item) => ({
          listing: item.listing,
          actions: (
            <CardStatus
              icon="action.message"
              label={INVITE_STATE_LABEL[item.state]}
              detail={`Expires ${item.expiresOn}`}
            />
          ),
        }))}
        emptyTitle="No invites yet"
        emptyMessage="When a host invites you to apply, it'll show up here."
      />
    </BucketPage>
  );
}
