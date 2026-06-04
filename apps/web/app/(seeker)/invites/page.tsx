import type { Metadata } from "next";

import {
  BucketPage,
  CardStatus,
  INVITE_STATE_LABEL,
  LifecycleList,
  getInviteItems,
} from "../../../components/seeker";

export const metadata: Metadata = {
  title: "Invites",
};

export default async function InvitesPage() {
  const inviteItems = await getInviteItems();
  return (
    <BucketPage title="Invites" description="Hosts who invited you to apply.">
      <LifecycleList
        surface="saved"
        items={inviteItems.map((item) => ({
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
