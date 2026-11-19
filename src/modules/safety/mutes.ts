// Mutes (SP4 spec 8.7; plan Task 25). A seeker mutes a host: the host can't invite them (SP5
// shows "Not accepting invites right now" and spends no credit), and muting also unfollows the
// host. Only the seeker ever sees their mutes. The audit row names the muted org as its
// subject, never under the org's own `org_id`.
import { and, desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
import { unfollow } from '@/modules/hostpages';
import { getOrgSummaries } from '@/modules/orgs';
import { isUuid } from './ids';
import { mutes } from './schema';

/** Idempotent; an unknown org is `not_found`. Also unfollows the org. */
export async function mute(db: DbOrTx, i: { userId: string; orgId: string }): Promise<void> {
  const missing = () => notFound("We couldn't find that host");
  if (!isUuid(i.orgId) || !isUuid(i.userId)) throw missing();
  await db.transaction(async (tx) => {
    const org = (await getOrgSummaries(tx, [i.orgId])).get(i.orgId);
    if (!org || org.deleted) throw missing();
    const inserted = await tx
      .insert(mutes)
      .values({ seekerUserId: i.userId, orgId: i.orgId })
      .onConflictDoNothing()
      .returning({ orgId: mutes.orgId });
    await unfollow(tx, i.userId, i.orgId);
    if (inserted.length > 0) {
      await record(tx, {
        actorType: 'user',
        actorId: i.userId,
        action: 'safety.mute_created',
        subjectType: 'organization',
        subjectId: i.orgId,
      });
    }
  });
}

/** Idempotent. */
export async function unmute(db: DbOrTx, i: { userId: string; orgId: string }): Promise<void> {
  if (!isUuid(i.orgId) || !isUuid(i.userId)) return;
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(mutes)
      .where(and(eq(mutes.seekerUserId, i.userId), eq(mutes.orgId, i.orgId)))
      .returning({ orgId: mutes.orgId });
    if (removed.length > 0) {
      await record(tx, {
        actorType: 'user',
        actorId: i.userId,
        action: 'safety.mute_removed',
        subjectType: 'organization',
        subjectId: i.orgId,
      });
    }
  });
}

/** The orgs the seeker muted, newest first. */
export async function listMutes(
  db: DbOrTx,
  userId: string,
): Promise<{ orgId: string; mutedAt: Date }[]> {
  if (!isUuid(userId)) return [];
  const rows = await db
    .select({ orgId: mutes.orgId, mutedAt: mutes.createdAt })
    .from(mutes)
    .where(eq(mutes.seekerUserId, userId))
    .orderBy(desc(mutes.createdAt), desc(mutes.orgId));
  return rows;
}
