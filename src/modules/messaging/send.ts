// Sending a message, and delivering one the scam scan released (SP5 W4).
import { and, eq, isNull } from 'drizzle-orm';
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

/** Stamps the viewer's side and, when asked, notifies the other side. No message body leaves. */
export async function deliverMessage(
  db: DbOrTx,
  thread: ThreadRow,
  message: Pick<MessageRow, 'id' | 'senderType' | 'senderUserId' | 'createdAt'>,
): Promise<void> {
  const at = message.createdAt;
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
        .set({ firstHostReplyAt: at })
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
  i: { threadId: string; senderUserId: string; body: string; bulkId?: string },
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
    visibleTo: 'all',
    scanState,
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
  const [existing] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.threadId, threadId),
        eq(messages.senderUserId, senderUserId),
        eq(messages.clientId, input.clientId),
      ),
    )
    .limit(1);
  if (existing) return { message: await presentMessage(db, viewer, fresh, existing) };

  const attachmentMediaIds = input.attachmentMediaIds ?? [];
  await assertAttachments(db, viewer, attachmentMediaIds);

  const messageId = await withTx(db, async (tx) => {
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
    const id = await sendHostMessage(tx, {
      threadId,
      senderUserId,
      body: input.body ?? '',
    });
    if (!id) return null;
    await tx
      .update(messages)
      .set({ attachmentMediaIds, clientId: input.clientId })
      .where(eq(messages.id, id));
    return id;
  });
  if (!messageId) readOnlyConflict();
  const row = await loadMessage(db, messageId);
  if (!row) throw notFound();
  return { message: await presentMessage(db, viewer, fresh, row) };
}

/** Trust `approve` on a held message delivers it; `remove` hides it from the seeker. */
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
  const wasHeld = row.scanState === 'held';
  await db.update(messages).set({ scanState: 'clear' }).where(eq(messages.id, messageId));
  if (!wasHeld) return;
  const thread = await loadThread(db, row.threadId);
  if (!thread) return;
  await deliverMessage(db, thread, row);
}
