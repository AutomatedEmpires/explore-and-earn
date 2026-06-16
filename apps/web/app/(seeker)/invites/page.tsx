import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSeekerInvites } from "@explore-and-earn/db";

import {
  BucketPage,
  InviteActions,
  LifecycleList,
} from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";

export const metadata: Metadata = {
  title: "Invites",
};

// Invites are per-seeker and change as hosts invite / the seeker responds, so
// this route must never be statically cached.
export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <BucketPage title="Invites" description="Hosts who invited you to apply.">
        <EmptyState
          title="Sign in to see your invites"
          message="Once you're signed in, invitations from hosts will show up here."
        />
      </BucketPage>
    );
  }

  const invites = await getSeekerInvites(token, userId);

  // Drop invites whose listing could not be resolved (e.g. deleted listing).
  const items = invites.flatMap((entry) =>
    entry.listing
      ? [
          {
            listing: entry.listing,
            cardState: "invited" as const,
            actions: (
              <InviteActions
                inviteId={entry.invite.id}
                expiresAt={entry.invite.expiresAt}
              />
            ),
          },
        ]
      : [],
  );

  const heading = items.length > 0 ? `Invites (${items.length})` : "Invites";

  return (
    <BucketPage title={heading} description="Hosts who invited you to apply.">
      <LifecycleList
        surface="invites"
        items={items}
        emptyIllustration="empty.invites"
        emptyTitle="No invites yet"
        emptyMessage="When a host invites you to apply, it'll show up here. A complete resume gets you noticed faster."
        emptyActionLabel="Strengthen your resume"
        emptyActionHref="/resume"
      />
    </BucketPage>
  );
}
