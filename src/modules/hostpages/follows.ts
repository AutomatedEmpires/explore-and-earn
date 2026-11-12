// Follows (SP2 spec sections 5 and 8.5): seekers follow public host pages and hear about each new
// job. Follow lists are private: hosts see only the count, and only past 25.
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
import { enqueue, readEnvelope } from '@/modules/jobs';
import { getListingSummaries } from '@/modules/listings';
import { notify } from '@/modules/notifications';
import { getOrgSummaries, resolveSlug } from '@/modules/orgs';
import { transact } from './editor';
import { NEW_JOB } from './notifications';
import { getHostIdentities, isPublicHost, type HostIdentity } from './public';
import { hostFollows } from './schema';

export const NOTIFY_FOLLOWERS_TOPIC = 'hostpages.notify_followers';

/** Followers notified per run of hostpages.notify_followers. */
export const FOLLOWERS_PER_RUN = 500;

/** Follows the host at `slug` (seekers). 404 unless its page is public. Following twice is fine. */
export async function follow(
  db: DbOrTx,
  userId: string,
  slug: string,
): Promise<{ following: true }> {
  const resolved = await resolveSlug(db, slug);
  if (!resolved || !(await isPublicHost(db, resolved.orgId))) {
    throw notFound('Host page not found');
  }
  const orgId = resolved.orgId;
  await transact(db, async (tx) => {
    const added = await tx
      .insert(hostFollows)
      .values({ userId, orgId })
      .onConflictDoNothing()
      .returning({ orgId: hostFollows.orgId });
    if (added.length === 0) return;
    // The team activity log shows this as "A job seeker" (follow lists are private).
    await record(tx, {
      actorType: 'user',
      actorId: userId,
      orgId,
      action: 'hostpages.followed',
      subjectType: 'host_page',
      subjectId: orgId,
    });
  });
  return { following: true };
}

/** Stops following. SP4 calls this when a seeker mutes or blocks the host. */
export async function unfollow(db: DbOrTx, userId: string, orgId: string): Promise<void> {
  await db
    .delete(hostFollows)
    .where(and(eq(hostFollows.userId, userId), eq(hostFollows.orgId, orgId)));
}

/** Unfollows the host at `slug` (a retired slug works too). 404 for an unknown slug. */
export async function unfollowHost(
  db: DbOrTx,
  userId: string,
  slug: string,
): Promise<{ following: false }> {
  const resolved = await resolveSlug(db, slug);
  if (!resolved) throw notFound('Host page not found');
  await unfollow(db, userId, resolved.orgId);
  return { following: false };
}

/** The org's followers in user id order, `limit` at a time. Pass `next` back as `after`. */
export async function listFollowerIds(
  db: DbOrTx,
  orgId: string,
  i: { after?: string; limit: number },
): Promise<{ userIds: string[]; next: string | null }> {
  const limit = Math.max(1, Math.min(1000, Math.floor(i.limit)));
  const rows = await db
    .select({ userId: hostFollows.userId })
    .from(hostFollows)
    .where(and(eq(hostFollows.orgId, orgId), i.after ? gt(hostFollows.userId, i.after) : undefined))
    .orderBy(asc(hostFollows.userId))
    .limit(limit + 1);
  const userIds = rows.slice(0, limit).map((r) => r.userId);
  const last = userIds[userIds.length - 1];
  return { userIds, next: rows.length > limit && last ? last : null };
}

/** The public hosts a seeker follows, most recently followed first. */
export async function listFollows(db: DbOrTx, userId: string): Promise<{ items: HostIdentity[] }> {
  const rows = await db
    .select({ orgId: hostFollows.orgId })
    .from(hostFollows)
    .where(eq(hostFollows.userId, userId))
    .orderBy(desc(hostFollows.createdAt), asc(hostFollows.orgId));
  const identities = await getHostIdentities(
    db,
    rows.map((r) => r.orgId),
  );
  return { items: rows.flatMap((r) => identities.get(r.orgId) ?? []) };
}

/**
 * hostpages.notify_followers, on `listing.published`: a first publish (reposts included)
 * notifies the host's followers with `hosts.new_job`, 500 per run. Each run notifies its page
 * and enqueues the next one in one transaction, so a retry never notifies anyone twice.
 */
export async function notifyFollowersJob(db: Db, payload: unknown): Promise<void> {
  const envelope = readEnvelope(payload, 'listing.published');
  const { data, eventId } = envelope;
  if (!data.first) return;
  const rawCursor = (payload as { cursor?: unknown }).cursor;
  const cursor = typeof rawCursor === 'string' ? rawCursor : undefined;

  if (!(await isPublicHost(db, data.orgId))) return;
  const org = (await getOrgSummaries(db, [data.orgId])).get(data.orgId);
  const listing = (await getListingSummaries(db, [data.listingId])).get(data.listingId);
  const page = await listFollowerIds(db, data.orgId, { after: cursor, limit: FOLLOWERS_PER_RUN });

  await transact(db, async (tx) => {
    const notice = {
      orgName: org?.name ?? null,
      listingTitle: listing?.title ?? null,
      href: `/jobs/view/${data.listingId}`,
    };
    for (const userId of page.userIds) await notify(tx, userId, NEW_JOB, notice);
    if (page.next) {
      await enqueue(tx, {
        topic: NOTIFY_FOLLOWERS_TOPIC,
        payload: { ...envelope, cursor: page.next },
        dedupeKey: `${eventId}:followers:${page.next}`,
      });
    }
  });
}
