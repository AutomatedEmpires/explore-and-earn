// Sending a message, and delivering one the scam scan released (SP5 W4).
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '@/lib/db';
import { withTx } from '@/lib/db';
import { conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { MessageView, SendMessageInput } from '@/lib/messaging';
import { READ_ONLY } from '@/lib/messaging';
import { enqueue } from '@/modules/jobs';
import { getMediaMeta } from '@/modules/media';
import { notify } from '@/modules/notifications';
import { getOrgSummaries } from '@/modules/orgs';
import { getCommunityIdentities } from '@/modules/profiles';
import { getRelationships } from '@/modules/safety';
import type { ThreadViewer } from './access';
import { listingTeam } from './access';
import { bulkMessages, messages, threads } from './schema';
import {
  blockingReason,
  canParticipate,
  loadMessage,
  loadThread,
  presentMessage,
  readOnlyConflict,
  stampBlocked,
  viewerUserId,
} from './threads';

type ThreadRow = typeof threads.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

/**
 * Call point for explore-and-earn#119. `detectPreOfferRequest` is not on this branch.
 * When it lands, this function calls it with the send that was just accepted.
 */
export async function notePreOfferRequest(
  _db: DbOrTx,
  _i: { threadId: string; orgId: string; senderUserId: string; body: string; hired: boolean },
): Promise<void> {
  // #119: detectPreOfferRequest(db, { threadId, orgId, senderUserId, body, hired })
}

/**
 * Call point for explore-and-earn#102. The product-events helper is not on this branch.
 * A delivered host message emits `host_replied`, and the first one also emits `first_reply`.
 * Payloads stay ids only.
 */
export async function noteHostReply(
  _db: DbOrTx,
  _i: {
    kind: 'host_replied' | 'first_reply';
    orgId: string;
    listingId: string;
    threadId: string;
    messageId: string;
  },
): Promise<void> {
  // #102: emit({ type: kind, orgId, listingId, threadId, messageId })
}

async function senderFirstName(db: DbOrTx, userId: string | null): Promise<string> {
  if (!userId) return '';
  const names = await getCommunityIdentities(db, [userId]);
  return names.get(userId)?.firstName ?? '';
}

async function notifySide(
  db: DbOrTx,
  i: {
    userIds: string[];
    threadId: string;
    audience: 'host' | 'seeker';
    orgName: string;
    firstName: string;
  },
): Promise<void> {
  const data = {
    threadId: i.threadId,
    audience: i.audience,
    orgName: i.orgName,
    firstName: i.firstName,
  };
  for (const userId of [...new Set(i.userIds)]) {
    await notify(db, userId, 'messages.new', data);
  }
}

/**
 * Stamps the receiving side's unread time and notifies it. No message body leaves. The unread
 * time is the delivery time, not the send time, so a message the scan or an operator releases
 * after the reader last opened the thread still makes it unread. The first host reply keeps
 * the send time: that is when the host answered.
 */
export async function deliverMessage(
  db: DbOrTx,
  thread: ThreadRow,
  message: Pick<MessageRow, 'id' | 'senderType' | 'senderUserId' | 'createdAt'>,
): Promise<void> {
  const at = new Date();
  const toSeeker = message.senderType !== 'seeker';
  if (toSeeker) {
    const current = thread.lastToSeekerAt;
    await db
      .update(threads)
      .set({ lastToSeekerAt: !current || at > current ? at : current })
      .where(eq(threads.id, thread.id));
    if (message.senderType === 'host') {
      const stamped = await db
        .update(threads)
        .set({ firstHostReplyAt: message.createdAt })
        .where(and(eq(threads.id, thread.id), isNull(threads.firstHostReplyAt)))
        .returning({ id: threads.id });
      await noteHostReply(db, {
        kind: 'host_replied',
        orgId: thread.orgId,
        listingId: thread.listingId,
        threadId: thread.id,
        messageId: message.id,
      });
      if (stamped.length > 0) {
        await noteHostReply(db, {
          kind: 'first_reply',
          orgId: thread.orgId,
          listingId: thread.listingId,
          threadId: thread.id,
          messageId: message.id,
        });
      }
    }
  } else {
    const current = thread.lastToHostAt;
    await db
      .update(threads)
      .set({ lastToHostAt: !current || at > current ? at : current })
      .where(eq(threads.id, thread.id));
  }
  const orgName = (await getOrgSummaries(db, [thread.orgId])).get(thread.orgId)?.name ?? '';
  const firstName = await senderFirstName(db, message.senderUserId);
  if (toSeeker) {
    await notifySide(db, {
      userIds: [thread.seekerUserId],
      threadId: thread.id,
      audience: 'seeker',
      orgName,
      firstName,
    });
    return;
  }
  const team = await listingTeam(db, { orgId: thread.orgId, listingId: thread.listingId });
  await notifySide(db, {
    userIds: team,
    threadId: thread.id,
    audience: 'host',
    orgName,
    firstName,
  });
}

export async function sendHostMessage(
  tx: Tx,
  i: {
    threadId: string;
    senderUserId: string;
    body: string;
    bulkId?: string;
    clientId?: string;
    attachmentMediaIds?: string[];
  },
): Promise<string | null> {
  const thread = await loadThread(tx, i.threadId);
  if (!thread) return null;
  const [rel] = await getRelationships(tx, {
    orgId: thread.orgId,
    seekerUserIds: [thread.seekerUserId],
  });
  if (rel?.blocked) {
    await stampBlocked(tx, thread);
    return null;
  }
  if (await blockingReason(tx, thread)) return null;

  let scanState: 'pending' | 'clear' | 'warn' = 'pending';
  let deliverNow = false;
  if (thread.hiredAt) {
    scanState = 'clear';
    deliverNow = true;
  } else if (i.bulkId) {
    const [bulk] = await tx.select().from(bulkMessages).where(eq(bulkMessages.id, i.bulkId));
    if (!bulk || (bulk.scanState !== 'clear' && bulk.scanState !== 'warn')) return null;
    scanState = bulk.scanState;
    deliverNow = true;
  }

  const id = newId();
  const now = new Date();
  await tx.insert(messages).values({
    id,
    threadId: thread.id,
    senderType: 'host',
    senderUserId: i.senderUserId,
    kind: 'text',
    body: i.body.length > 0 ? i.body : null,
    attachmentMediaIds: i.attachmentMediaIds ?? [],
    visibleTo: 'all',
    scanState,
    clientId: i.clientId ?? null,
    bulkId: i.bulkId ?? null,
    createdAt: now,
  });
  if (deliverNow) {
    await deliverMessage(tx, thread, {
      id,
      senderType: 'host',
      senderUserId: i.senderUserId,
      createdAt: now,
    });
  } else {
    await enqueue(tx, {
      topic: 'messaging.scan',
      payload: { messageId: id },
      dedupeKey: `mscan:${id}`,
    });
  }
  await notePreOfferRequest(tx, {
    threadId: thread.id,
    orgId: thread.orgId,
    senderUserId: i.senderUserId,
    body: i.body,
    hired: thread.hiredAt !== null,
  });
  return id;
}

async function assertAttachments(
  db: DbOrTx,
  viewer: ThreadViewer,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const meta = await getMediaMeta(db, ids);
  for (const id of ids) {
    const row = meta.get(id);
    const owned =
      row !== undefined &&
      (viewer.kind === 'seeker'
        ? row.ownerUserId === viewer.userId
        : row.ownerOrgId === viewer.ctx.orgId);
    if (!row || row.kind !== 'attachment' || row.status !== 'approved' || !owned) {
      throw conflict('Attachment not ready', { reason: 'attachment_not_ready' });
    }
  }
}

export async function sendMessage(
  db: Db,
  viewer: ThreadViewer,
  threadId: string,
  input: SendMessageInput,
): Promise<{ message: MessageView }> {
  const thread = await loadThread(db, threadId);
  if (!thread || !(await canParticipate(db, viewer, thread))) throw notFound();
  const [rel] = await getRelationships(db, {
    orgId: thread.orgId,
    seekerUserIds: [thread.seekerUserId],
  });
  if (rel?.blocked) await stampBlocked(db, thread);
  const fresh = (await loadThread(db, threadId)) ?? thread;
  if (await blockingReason(db, fresh)) throw conflict(READ_ONLY, { reason: 'read_only' });

  const senderUserId = viewerUserId(viewer);
  const existing = await findByClientId(db, threadId, senderUserId, input.clientId);
  if (existing) return { message: await presentMessage(db, viewer, fresh, existing) };

  const attachmentMediaIds = input.attachmentMediaIds ?? [];
  await assertAttachments(db, viewer, attachmentMediaIds);

  let messageId: string | null;
  try {
    messageId = await insertMessage(db, viewer, fresh, { ...input, attachmentMediaIds });
  } catch (err) {
    // A retry with the same client id committed between the lookup above and this insert
    // (messages_client_idx). This transaction rolled back, so the stored message is the answer.
    const raced = isUniqueViolation(err)
      ? await findByClientId(db, threadId, senderUserId, input.clientId)
      : undefined;
    if (!raced) throw err;
    return { message: await presentMessage(db, viewer, fresh, raced) };
  }
  if (!messageId) readOnlyConflict();
  const row = await loadMessage(db, messageId);
  if (!row) throw notFound();
  return { message: await presentMessage(db, viewer, fresh, row) };
}

/** True for a Postgres unique violation anywhere in the error's cause chain. */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

async function findByClientId(
  db: DbOrTx,
  threadId: string,
  senderUserId: string,
  clientId: string,
): Promise<MessageRow | undefined> {
  const [row] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.threadId, threadId),
        eq(messages.senderUserId, senderUserId),
        eq(messages.clientId, clientId),
      ),
    )
    .limit(1);
  return row;
}

/** Inserts and delivers (or queues for the scan) in one transaction. Null when read-only. */
async function insertMessage(
  db: Db,
  viewer: ThreadViewer,
  fresh: ThreadRow,
  input: SendMessageInput & { attachmentMediaIds: string[] },
): Promise<string | null> {
  const threadId = fresh.id;
  const senderUserId = viewerUserId(viewer);
  const attachmentMediaIds = input.attachmentMediaIds;
  return withTx(db, async (tx) => {
    if (viewer.kind === 'seeker') {
      const id = newId();
      const now = new Date();
      await tx.insert(messages).values({
        id,
        threadId,
        senderType: 'seeker',
        senderUserId,
        kind: 'text',
        body: input.body && input.body.length > 0 ? input.body : null,
        attachmentMediaIds,
        visibleTo: 'all',
        scanState: 'clear',
        clientId: input.clientId,
        createdAt: now,
      });
      await deliverMessage(tx, fresh, {
        id,
        senderType: 'seeker',
        senderUserId,
        createdAt: now,
      });
      await notePreOfferRequest(tx, {
        threadId,
        orgId: fresh.orgId,
        senderUserId,
        body: input.body ?? '',
        hired: fresh.hiredAt !== null,
      });
      return id;
    }
    return sendHostMessage(tx, {
      threadId,
      senderUserId,
      body: input.body ?? '',
      clientId: input.clientId,
      attachmentMediaIds,
    });
  });
}

/**
 * Releases a message that is `from` pending (the scan) or held (an operator) to `set.scanState`
 * and delivers it. The one release path: both callers get the same block check, unread stamps,
 * notification and thread card. A thread that became read-only meanwhile (a block, a withdrawal,
 * a removal or a long-closed listing) gets nothing (plan decision 11): the message is held, so
 * the host sees it as not delivered. A message that already left `from` is left alone, so a
 * release never delivers twice. Call it inside a transaction: state and delivery commit together.
 */
export async function releaseMessage(
  db: DbOrTx,
  row: MessageRow,
  from: 'pending' | 'held',
  set: { scanState: 'clear' | 'warn'; scanLabels?: string[]; checkId?: string | null },
): Promise<void> {
  const thread = await loadThread(db, row.threadId);
  if (!thread) return;
  const reason = await blockingReason(db, thread);
  if (reason === 'blocked') await stampBlocked(db, thread);
  const updated = await db
    .update(messages)
    .set(reason ? { ...set, scanState: 'held' } : set)
    .where(and(eq(messages.id, row.id), eq(messages.scanState, from)))
    .returning({ id: messages.id });
  if (updated.length === 0 || reason) return;
  await deliverMessage(db, thread, row);
}

/**
 * Trust `approve` on a held or still-pending message delivers it as a scan release does
 * (`releaseMessage`); on a warned one it drops the banner. `remove` hides it from the seeker,
 * and a later approve never brings a removed message back.
 */
export async function decideMessage(
  db: DbOrTx,
  messageId: string,
  action: 'approve' | 'remove',
): Promise<void> {
  const row = await loadMessage(db, messageId);
  if (!row) return;
  if (action === 'remove') {
    await db.update(messages).set({ scanState: 'removed' }).where(eq(messages.id, messageId));
    return;
  }
  if (row.scanState === 'removed') return;
  if (row.scanState === 'pending' || row.scanState === 'held') {
    await releaseMessage(db, row, row.scanState, { scanState: 'clear' });
    return;
  }
  await db
    .update(messages)
    .set({ scanState: 'clear' })
    .where(and(eq(messages.id, messageId), ne(messages.scanState, 'removed')));
}
