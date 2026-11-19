// Invite notifications. Data is IDs, the org name, the seeker's first name, the audience and
// the URL only (spec section 6); a note never goes into a notification.
import type { DbOrTx } from '@/lib/db';
import { notify } from '@/modules/notifications';
import { getOrgSummaries } from '@/modules/orgs';

type InviteRef = { id: string; orgId: string; listingId: string; seekerUserId: string };

export const seekerInviteUrl = (inviteId: string) => `/inbox/invites/${inviteId}`;

async function orgName(db: DbOrTx, orgId: string): Promise<string> {
  return (await getOrgSummaries(db, [orgId])).get(orgId)?.name ?? '';
}

/** `hiring.invite_received`: the invite is delivered to the seeker. */
export async function notifyInviteReceived(db: DbOrTx, invite: InviteRef): Promise<void> {
  await notify(db, invite.seekerUserId, 'hiring.invite_received', {
    inviteId: invite.id,
    listingId: invite.listingId,
    orgName: await orgName(db, invite.orgId),
    audience: 'seeker',
    url: seekerInviteUrl(invite.id),
  });
}

/** `hiring.invite_expiring`: 48 hours before a delivered invite expires. */
export async function notifyInviteExpiring(db: DbOrTx, invite: InviteRef): Promise<void> {
  await notify(db, invite.seekerUserId, 'hiring.invite_expiring', {
    inviteId: invite.id,
    listingId: invite.listingId,
    orgName: await orgName(db, invite.orgId),
    audience: 'seeker',
    url: seekerInviteUrl(invite.id),
  });
}

/** `hiring.invite_response`: the seeker answered; `interested` picks the title. */
export async function notifyInviteResponse(
  db: DbOrTx,
  userIds: string[],
  i: { inviteId: string; listingId: string; firstName: string; interested: boolean; threadId: string | null },
): Promise<void> {
  const url = i.threadId ? `/host/messages/${i.threadId}` : `/host/candidates?listingId=${i.listingId}`;
  for (const userId of userIds) {
    await notify(db, userId, 'hiring.invite_response', {
      inviteId: i.inviteId,
      listingId: i.listingId,
      threadId: i.threadId,
      firstName: i.firstName,
      interested: i.interested,
      audience: 'host',
      url,
    });
  }
}
