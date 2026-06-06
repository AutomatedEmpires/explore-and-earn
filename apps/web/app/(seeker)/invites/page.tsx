import type { Metadata } from "next";

import { BucketPage } from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";

export const metadata: Metadata = {
  title: "Invites",
};

// Invites are sourced from the dedicated `invites` table (migration 007), which
// is not yet surfaced here. We intentionally render an EmptyState rather than
// fabricating invite rows from `applications`.
export default function InvitesPage() {
  return (
    <BucketPage title="Invites" description="Hosts who invited you to apply.">
      <EmptyState
        title="No invites yet"
        message="Host invites aren't surfaced here yet. When a host invites you to apply, it'll show up here."
      />
    </BucketPage>
  );
}
