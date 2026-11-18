// Sending an invite (SP5 spec 8.4, plan Task 14, E4). One transaction, in the spec's order:
// lock the seeker -> one invite per listing -> the weekly cap across hosts -> live eligibility
// and relationship -> the listing is live -> the new-host daily cap (issue 117) -> spend one
// credit -> insert. Every refusal before the credit spends nothing. A note goes to the scan
// first and the seeker hears nothing until it clears; without one the seeker is told at once.
import { and, eq, sql } from 'drizzle-orm';
import { track } from '@/lib/analytics';
import { queryRows, withTx, type Db } from '@/lib/db';
import { conflict, isAppError, notFound, rateLimited } from '@/lib/errors';
import { INVITES, NO_CREDITS, SEEKER_UNAVAILABLE, type HostInviteItem } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { consume } from '@/modules/entitlements';
import { getOrgSummaries } from '@/modules/orgs';
import { getCandidateCards } from '@/modules/profiles';
import { consumeNewHostDaily } from '@/modules/ratelimit';
import { getRelationships } from '@/modules/safety';
import { getSetting } from '@/modules/settings';
import type { HostContext } from '@/server/guards';
import { requireListing } from '../access';
import { recordPipelineEvent } from '../core';
import { enqueueNoteScan } from '../notes';
import { requireApplicantAccess } from '../pools/gate';
import { applicantSeekerIds } from '../pools/refresh';
import { candidatePoolEntries, invites } from '../schema';
import { notifyInviteReceived } from './notify';
import { hostInviteItems } from './reads';

const DAY_MS = 86_400_000;
const CANDIDATE_NOT_FOUND = 'Candidate not found';

const unavailable = (message = SEEKER_UNAVAILABLE) => conflict(message, { reason: 'seeker_unavailable' });

export async function sendInvite(
  db: Db,
  ctx: HostContext,
  i: { candidateId: string; note?: string },
  now: Date = new Date(),
): Promise<{ invite: HostInviteItem }> {
  const [entry] = await db.select().from(candidatePoolEntries).where(eq(candidatePoolEntries.id, i.candidateId));
  if (!entry || entry.orgId !== ctx.orgId) throw notFound(CANDIDATE_NOT_FOUND);
  const h = await requireListing(db, ctx, entry.listingId).catch((err: unknown) => {
    throw isAppError(err) && err.code === 'not_found' ? notFound(CANDIDATE_NOT_FOUND) : err;
  });
  await requireApplicantAccess(db, ctx.orgId);

  const note = i.note?.trim() ? i.note.trim() : null;
  const weeklyCap = await getSetting(db, 'limits.invites_per_seeker_per_week');
  const org = (await getOrgSummaries(db, [ctx.orgId])).get(ctx.orgId);
  const seekerUserId = entry.seekerUserId;
  const inviteId = newId();

  await withTx(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`invite_seeker:${seekerUserId}`}, 0))`);

    const [existing] = await tx
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.listingId, h.id), eq(invites.seekerUserId, seekerUserId)));
    if (existing) {
      throw conflict('You already invited this candidate to this listing.', { reason: 'already_invited' });
    }

    const [recent] = await queryRows<{ n: number }>(
      tx,
      sql`select count(*)::int as n from app.invites
          where seeker_user_id = ${seekerUserId}::uuid
            and sent_at > ${new Date(now.getTime() - 7 * DAY_MS)}
            and scan_state <> 'held'`,
    );
    if ((recent?.n ?? 0) >= weeklyCap) throw unavailable();

    const cards = await getCandidateCards(tx, { orgId: ctx.orgId, seekerUserIds: [seekerUserId], stage: 'pool' });
    const [relationship] = await getRelationships(tx, { orgId: ctx.orgId, seekerUserIds: [seekerUserId] });
    if (cards.length === 0 || relationship?.blocked || relationship?.muted) throw unavailable();
    if ((await applicantSeekerIds(tx, h.id, [seekerUserId])).size > 0) {
      throw unavailable('This person already applied to this listing.');
    }

    if (h.status !== 'active') {
      throw conflict('Invites go out only for a live listing.', { reason: 'listing_inactive' });
    }

    const daily = await consumeNewHostDaily(tx, ctx.orgId, 'invites', org?.createdAt ?? now, now);
    if (!daily.allowed) {
      throw rateLimited("You've sent today's invites for a new account. You can send more tomorrow.", {
        reason: 'new_host_daily_cap',
        resetAt: daily.resetAt.toISOString(),
      });
    }

    const spent = await consume(tx, {
      orgId: ctx.orgId,
      kind: 'invite_credit',
      quantity: 1,
      subjectType: 'invite',
      subjectId: inviteId,
      idempotencyKey: `invite:${inviteId}`,
      actor: { type: 'user', id: ctx.user.id },
    });
    if (!spent.ok) throw conflict(NO_CREDITS, { reason: 'no_credits' });

    await tx.insert(invites).values({
      id: inviteId,
      orgId: ctx.orgId,
      listingId: h.id,
      seekerUserId,
      candidateId: entry.id,
      sentBy: ctx.user.id,
      note,
      status: 'sent',
      scanState: note ? 'pending' : 'clear',
      sentAt: now,
      expiresAt: new Date(now.getTime() + INVITES.expiryDays * DAY_MS),
    });
    await recordPipelineEvent(tx, {
      orgId: ctx.orgId,
      listingId: h.id,
      locationId: h.locationId,
      inviteId,
      kind: 'invite_sent',
      actor: { type: 'host', userId: ctx.user.id, orgId: ctx.orgId },
      at: now,
    });
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: ctx.orgId,
      action: 'hiring.invite_sent',
      subjectType: 'invite',
      subjectId: inviteId,
      data: { listingId: h.id, withNote: note !== null },
    });
    if (note) await enqueueNoteScan(tx, 'invite', inviteId);
    else await notifyInviteReceived(tx, { id: inviteId, orgId: ctx.orgId, listingId: h.id, seekerUserId });
  });

  track('hiring.invite_sent', { inviteId, listingId: h.id }, ctx.user.id);
  const invite = (await hostInviteItems(db, ctx.orgId, [inviteId], now)).get(inviteId);
  if (!invite) throw notFound('Invite not found');
  return { invite };
}
