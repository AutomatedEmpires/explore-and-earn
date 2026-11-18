// A seeker's answer to an invite (SP5 spec 8.4, plan Task 15). Only a delivered `sent` invite
// can be answered; one past `expires_at`, or whose listing stopped being live, is 409 `expired`
// before the sweep runs, so a listing paused or closed opens no thread and reveals nothing.
// Repeating the recorded answer returns it unchanged and a different one is 409
// `already_responded` (plan decision 21). Interested opens the thread, posts the invite card and
// lets the host see the seeker at SP4's `interested` stage. Mute host mutes the org and answers
// Not interested while the invite is open.
import { and, eq } from 'drizzle-orm';
import type { Actor } from '@/lib/applications';
import { withTx, type Db, type DbOrTx, type Tx } from '@/lib/db';
import { conflict, notFound } from '@/lib/errors';
import { INVITE_EXPIRED, type InviteResponse, type SeekerInviteItem } from '@/lib/hiring';
import { record } from '@/modules/audit';
import { getHiringInfoMany, type ListingHiringInfo } from '@/modules/listings';
import { ensureThread, listingTeam, postCard, postEvent } from '@/modules/messaging';
import { listMembers } from '@/modules/orgs';
import { getCommunityIdentities, grantReveal } from '@/modules/profiles';
import { mute } from '@/modules/safety';
import { recordPipelineEvent } from '../core';
import { invites } from '../schema';
import { notifyInviteResponse } from './notify';
import { INVITE_NOT_FOUND, seekerInviteItems, type InviteRow } from './reads';
import { isDelivered } from './status';

const SOMEONE = 'A candidate';

async function lockOwnInvite(tx: Tx, seekerUserId: string, inviteId: string): Promise<InviteRow> {
  const [row] = await tx
    .select()
    .from(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.seekerUserId, seekerUserId)))
    .for('update');
  if (!row || !isDelivered(row.scanState)) throw notFound(INVITE_NOT_FOUND);
  return row;
}

function isExpired(row: InviteRow, now: Date): boolean {
  return row.status === 'expired' || (row.status === 'sent' && row.expiresAt.getTime() <= now.getTime());
}

/**
 * The invite's listing while it is live, read in the answer's transaction. The sweep expires a
 * sent invite whose listing stopped being live; until it runs, null answers as expired.
 */
async function liveListing(tx: Tx, row: InviteRow): Promise<ListingHiringInfo | null> {
  const [listing] = await getHiringInfoMany(tx, [row.listingId]);
  return listing?.status === 'active' ? listing : null;
}

/** The answer an invite already records, or null while it is open. */
function recordedAnswer(row: InviteRow): InviteResponse['response'] | null {
  if (row.status === 'interested' || row.status === 'applied') return 'interested';
  if (row.status === 'not_interested') return 'not_interested';
  return null;
}

/** The sender while still a member, otherwise the listing's team (SP4's notify rule). */
async function hostRecipients(db: DbOrTx, row: InviteRow): Promise<string[]> {
  const members = await listMembers(db, row.orgId);
  if (members.some((m) => m.userId === row.sentBy)) return [row.sentBy];
  return listingTeam(db, { orgId: row.orgId, listingId: row.listingId });
}

/** Writes the answer, its pipeline event and audit row, and tells the host side. */
async function answer(
  tx: Tx,
  row: InviteRow,
  listing: ListingHiringInfo,
  i: { response: InviteResponse['response']; reason: InviteResponse['reason'] | null; threadId: string | null },
  now: Date,
): Promise<void> {
  const interested = i.response === 'interested';
  await tx
    .update(invites)
    .set({
      status: i.response,
      declineReason: interested ? null : (i.reason ?? null),
      respondedAt: now,
      ...(i.threadId ? { threadId: i.threadId } : {}),
    })
    .where(eq(invites.id, row.id));
  const actor: Actor = { type: 'seeker', userId: row.seekerUserId };
  await recordPipelineEvent(tx, {
    orgId: row.orgId,
    listingId: row.listingId,
    locationId: listing.locationId,
    inviteId: row.id,
    kind: interested ? 'invite_interested' : 'invite_not_interested',
    actor,
    at: now,
  });
  await record(tx, {
    actorType: 'user',
    actorId: row.seekerUserId,
    orgId: row.orgId,
    action: 'hiring.invite_responded',
    subjectType: 'invite',
    subjectId: row.id,
    data: { response: i.response, reason: interested ? null : (i.reason ?? null) },
  });
  const name = (await getCommunityIdentities(tx, [row.seekerUserId])).get(row.seekerUserId);
  await notifyInviteResponse(tx, await hostRecipients(tx, row), {
    inviteId: row.id,
    listingId: row.listingId,
    firstName: name?.firstName ?? SOMEONE,
    interested,
    threadId: i.threadId,
  });
}

async function seekerItem(db: Db, seekerUserId: string, inviteId: string, now: Date): Promise<SeekerInviteItem> {
  const invite = (await seekerInviteItems(db, seekerUserId, [inviteId], now)).get(inviteId);
  if (!invite) throw notFound(INVITE_NOT_FOUND);
  return invite;
}

export async function respondToInvite(
  db: Db,
  seekerUserId: string,
  inviteId: string,
  i: InviteResponse,
  now: Date = new Date(),
): Promise<{ invite: SeekerInviteItem; threadId: string | null }> {
  const threadId = await withTx(db, async (tx) => {
    const row = await lockOwnInvite(tx, seekerUserId, inviteId);
    if (isExpired(row, now)) throw conflict(INVITE_EXPIRED, { reason: 'expired' });
    const recorded = recordedAnswer(row);
    if (recorded === i.response) return row.threadId;
    if (recorded !== null) {
      throw conflict('You already answered this invite.', { reason: 'already_responded' });
    }
    const listing = await liveListing(tx, row);
    if (!listing) throw conflict(INVITE_EXPIRED, { reason: 'expired' });

    if (i.response === 'not_interested') {
      await answer(tx, row, listing, { response: 'not_interested', reason: i.reason ?? null, threadId: null }, now);
      return null;
    }

    const thread = await ensureThread(tx, {
      orgId: row.orgId,
      listingId: row.listingId,
      seekerUserId,
      inviteId: row.id,
    });
    await answer(tx, row, listing, { response: 'interested', reason: null, threadId: thread.threadId }, now);
    await postCard(tx, thread.threadId, { type: 'invite', refId: row.id }, null);
    await postEvent(tx, thread.threadId, { code: 'invite_interested', visibleTo: 'all' });
    await grantReveal(tx, { seekerUserId, orgId: row.orgId, reason: 'invite_interested', sourceId: row.id });
    return thread.threadId;
  });
  return { invite: await seekerItem(db, seekerUserId, inviteId, now), threadId };
}

/** Mutes the host (SP4 safety) and answers an open invite Not interested, with no reason. */
export async function muteInviteHost(
  db: Db,
  seekerUserId: string,
  inviteId: string,
  now: Date = new Date(),
): Promise<{ invite: SeekerInviteItem }> {
  await withTx(db, async (tx) => {
    const row = await lockOwnInvite(tx, seekerUserId, inviteId);
    await mute(tx, { userId: seekerUserId, orgId: row.orgId });
    if (row.status !== 'sent' || isExpired(row, now)) return;
    const listing = await liveListing(tx, row);
    if (listing) await answer(tx, row, listing, { response: 'not_interested', reason: null, threadId: null }, now);
  });
  return { invite: await seekerItem(db, seekerUserId, inviteId, now) };
}
