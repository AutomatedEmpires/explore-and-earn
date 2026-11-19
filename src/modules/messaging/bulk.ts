// One template, scanned once, sent to each open thread (SP5 W4, plan decision 26). A host the
// applicant verification gate refuses sends none: it is refused at create with the applicant
// list's 409, and a bulk queued before the gate refused it sends no copy (gate.ts; issue 199).
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ApplicationStatus } from '@/lib/applications';
import type { Db, DbOrTx } from '@/lib/db';
import { queryRows, withTx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { BULK, MESSAGES } from '@/lib/messaging';
import { record } from '@/modules/audit';
import { enqueue } from '@/modules/jobs';
import { getRelationships } from '@/modules/safety';
import type { HostContext } from '@/server/guards';
import { requireHiringCapability } from './access';
import { hostMayMessage, requireMessagingAccess } from './gate';
import { bulkMessages, messages, threads } from './schema';
import { scanHostText } from './scan';
import { sendHostMessage } from './send';
import { threadIdsForApplications } from './threads';

const CLOSE_MS = MESSAGES.readOnlyAfterCloseDays * 24 * 60 * 60 * 1000;

function stillOpen(row: typeof threads.$inferSelect, now: Date): boolean {
  if (row.readOnlyReason) return false;
  return !(row.listingClosedAt && now.getTime() - row.listingClosedAt.getTime() > CLOSE_MS);
}

export async function createBulkMessage(
  db: Db,
  ctx: HostContext,
  i: { listingId: string; statuses: ApplicationStatus[]; body: string; applicationIds: string[] },
): Promise<{ bulkId: string; recipients: number }> {
  requireHiringCapability(ctx, 'messages.access');
  await requireMessagingAccess(db, ctx.orgId);
  const byApplication = await threadIdsForApplications(db, i.applicationIds);
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const applicationId of i.applicationIds) {
    const threadId = byApplication.get(applicationId);
    if (!threadId || seen.has(threadId)) continue;
    seen.add(threadId);
    ordered.push(threadId);
  }
  const rows =
    ordered.length === 0
      ? []
      : await db
          .select()
          .from(threads)
          .where(
            and(
              inArray(threads.id, ordered),
              eq(threads.orgId, ctx.orgId),
              eq(threads.listingId, i.listingId),
            ),
          );
  const allowed = new Set(rows.map((row) => row.id));
  const scoped = ordered.filter((id) => allowed.has(id));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seekers = rows.map((row) => row.seekerUserId);
  const relationships =
    seekers.length === 0
      ? []
      : await getRelationships(db, { orgId: ctx.orgId, seekerUserIds: seekers });
  const blocked = new Set(relationships.filter((row) => row.blocked).map((row) => row.seekerUserId));
  for (const row of rows) {
    if (!blocked.has(row.seekerUserId) || row.readOnlyReason) continue;
    await db
      .update(threads)
      .set({ readOnlyReason: 'blocked' })
      .where(and(eq(threads.id, row.id), isNull(threads.readOnlyReason)));
    row.readOnlyReason = 'blocked';
  }
  const now = new Date();
  const open = scoped.filter((id) => {
    const row = byId.get(id);
    return row ? stillOpen(row, now) : false;
  });
  if (open.length > BULK.maxRecipients) {
    throw conflict('Too many recipients', { reason: 'too_many_recipients' });
  }
  const bulkId = newId();
  await db.insert(bulkMessages).values({
    id: bulkId,
    orgId: ctx.orgId,
    listingId: i.listingId,
    createdBy: ctx.user.id,
    body: i.body,
    statuses: i.statuses,
    recipientCount: open.length,
    sentCount: 0,
    threadIds: open,
    scanState: 'pending',
  });
  await enqueue(db, {
    topic: 'messaging.bulk_send',
    payload: { bulkId },
    dedupeKey: `bulk:${bulkId}`,
  });
  return { bulkId, recipients: open.length };
}

const bulkPayload = z.object({ bulkId: z.uuid() });

export async function runBulkSend(db: Db, payload: unknown): Promise<void> {
  const parsed = bulkPayload.safeParse(payload);
  if (!parsed.success) return;
  const bulkId = parsed.data.bulkId;
  const [bulk] = await db.select().from(bulkMessages).where(eq(bulkMessages.id, bulkId));
  if (!bulk) return;
  // The gate refused the host after it queued this: no scan and no copy. Each copy also checks
  // the gate (sendHostMessage), for a refusal that lands while the copies go out.
  if (!(await hostMayMessage(db, bulk.orgId))) return;

  let state = bulk.scanState;
  if (state === 'pending') {
    const outcome = await scanHostText(db, {
      subjectType: 'bulk_message',
      subjectId: bulk.id,
      text: bulk.body,
      orgId: bulk.orgId,
    });
    await db
      .update(bulkMessages)
      .set({ scanState: outcome.state, checkId: outcome.checkId })
      .where(and(eq(bulkMessages.id, bulk.id), eq(bulkMessages.scanState, 'pending')));
    state = outcome.state;
  }
  if (state !== 'clear' && state !== 'warn') return;

  for (const threadId of bulk.threadIds) {
    const [existing] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.threadId, threadId), eq(messages.bulkId, bulk.id)))
      .limit(1);
    if (existing) continue;
    await withTx(db, (tx) =>
      sendHostMessage(tx, {
        threadId,
        senderUserId: bulk.createdBy,
        body: bulk.body,
        bulkId: bulk.id,
      }),
    );
  }
  const [count] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from app.messages where bulk_id = ${bulk.id}`,
  );
  const sentCount = count?.n ?? 0;
  await db.update(bulkMessages).set({ sentCount }).where(eq(bulkMessages.id, bulk.id));
  await record(db, {
    actorType: 'system',
    actorId: null,
    orgId: bulk.orgId,
    action: 'messaging.bulk_sent',
    subjectType: 'bulk_message',
    subjectId: bulk.id,
    data: { recipientCount: bulk.recipientCount, sentCount },
  });
}

/** Trust decisions for a bulk template. Approve of a hold sends; remove hides what went out. */
export async function decideBulk(
  db: DbOrTx,
  bulkId: string,
  action: 'approve' | 'remove',
): Promise<void> {
  const [bulk] = await db.select().from(bulkMessages).where(eq(bulkMessages.id, bulkId));
  if (!bulk) return;
  if (action === 'remove') {
    await db.update(bulkMessages).set({ scanState: 'held' }).where(eq(bulkMessages.id, bulkId));
    await db.update(messages).set({ scanState: 'removed' }).where(eq(messages.bulkId, bulkId));
    return;
  }
  if (bulk.scanState === 'held') {
    await db.update(bulkMessages).set({ scanState: 'clear' }).where(eq(bulkMessages.id, bulkId));
    await enqueue(db, {
      topic: 'messaging.bulk_send',
      payload: { bulkId },
      dedupeKey: `bulk:${bulkId}:released`,
    });
    return;
  }
  if (bulk.scanState === 'warn') {
    await db.update(bulkMessages).set({ scanState: 'clear' }).where(eq(bulkMessages.id, bulkId));
    // Only the warned copies lose the banner. One an operator removed after a report stays removed.
    await db
      .update(messages)
      .set({ scanState: 'clear' })
      .where(and(eq(messages.bulkId, bulkId), eq(messages.scanState, 'warn')));
  }
}
