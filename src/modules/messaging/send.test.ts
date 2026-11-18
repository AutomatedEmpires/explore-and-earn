import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { decide, listOpenReviewItems } from '@/modules/trust';
// The operator seed is a trust test helper and is not on the trust public index.
// eslint-disable-next-line no-restricted-imports
import { addOperator } from '@/modules/trust/test-fixtures';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { safetyFake } from '@tests/fakes/sp5/sp4';
import { jobHandlers } from './jobs';
import './notification-types';
import { unreadThreadCount } from './reads';
import { messages, threadReads, threads } from './schema';
import { decideMessage, sendHostMessage, sendMessage } from './send';
import { hostViewer, seedAttachment, seedThread, seekerViewer } from './test-fixtures';
import { getThread, listThreads, markThreadHired, setThreadReadOnly } from './threads';

// `race.beforeAttachmentCheck` runs once, inside the next attachment check: after a send has
// looked its client id up and before it inserts. A test uses it to land a competing send there.
const race = vi.hoisted(() => ({ beforeAttachmentCheck: null as null | (() => Promise<void>) }));

vi.mock('@/modules/media', async (orig) => {
  const actual = await orig<typeof import('@/modules/media')>();
  return {
    ...actual,
    getMediaMeta: vi.fn(async (...args: Parameters<typeof actual.getMediaMeta>) => {
      const hook = race.beforeAttachmentCheck;
      race.beforeAttachmentCheck = null;
      if (hook) await hook();
      return actual.getMediaMeta(...args);
    }),
  };
});

vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));

async function seekerNotes(seekerId: string): Promise<number> {
  const [notes] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.notifications
        where user_id = ${seekerId} and type = 'messages.new'`,
  );
  return notes?.n ?? 0;
}

let t: TestDb;
let operatorId: string;

beforeAll(async () => {
  t = await createTestDb();
  operatorId = await addOperator(t.db, { queues: ['moderation', 'fraud'] });
  await import('./register');
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  const saved = [...safetyFake.subjects];
  safetyFake.reset();
  for (const subject of saved) safetyFake.subjects.push(subject);
  race.beforeAttachmentCheck = null;
});

describe('sending', () => {
  it('delivers a seeker message at once and notifies the listing team', async () => {
    const seeded = await seedThread(t.db);
    const sent = await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
      clientId: newId(),
      body: 'I can start Monday',
    });
    const view = await getThread(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), seeded.threadId);
    expect(view.messages.map((message) => message.id)).toContain(sent.message.id);
    const [notes] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.notifications
          where user_id = ${seeded.ownerId} and type = 'messages.new'`,
    );
    expect(notes?.n).toBe(1);
  });

  it('does not scan a host message in a hired thread', async () => {
    const seeded = await seedThread(t.db);
    await withTx(t.db, (tx) => markThreadHired(tx, seeded.threadId));
    const id = await withTx(t.db, (tx) =>
      sendHostMessage(tx, {
        threadId: seeded.threadId,
        senderUserId: seeded.ownerId,
        body: 'You are hired',
      }),
    );
    const [row] = await t.db.select().from(messages).where(eq(messages.id, id ?? ''));
    expect(row?.scanState).toBe('clear');
    const [jobs] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox
          where topic = 'messaging.scan' and payload->>'messageId' = ${id}`,
    );
    expect(jobs?.n).toBe(0);
  });

  it('refuses a blocked thread and a withdrawn thread without sending', async () => {
    const blocked = await seedThread(t.db);
    safetyFake.setBlocked(blocked.orgId, blocked.seekerId);
    const [jobsBefore] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox where topic = 'messaging.scan'`,
    );
    const blockedId = await withTx(t.db, (tx) =>
      sendHostMessage(tx, {
        threadId: blocked.threadId,
        senderUserId: blocked.ownerId,
        body: 'Hello',
      }),
    );
    expect(blockedId).toBeNull();
    const [blockedRow] = await t.db.select().from(threads).where(eq(threads.id, blocked.threadId));
    expect(blockedRow?.readOnlyReason).toBe('blocked');
    const [messagesN] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.messages where thread_id = ${blocked.threadId}`,
    );
    const [jobsAfter] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox where topic = 'messaging.scan'`,
    );
    const [notes] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.notifications
          where user_id = ${blocked.seekerId} and type = 'messages.new'`,
    );
    expect(messagesN?.n).toBe(0);
    expect(jobsAfter?.n).toBe(jobsBefore?.n);
    expect(notes?.n).toBe(0);

    const withdrawn = await seedThread(t.db);
    await withTx(t.db, (tx) => setThreadReadOnly(tx, withdrawn.threadId, 'withdrawn'));
    const withdrawnId = await withTx(t.db, (tx) =>
      sendHostMessage(tx, {
        threadId: withdrawn.threadId,
        senderUserId: withdrawn.ownerId,
        body: 'Hello',
      }),
    );
    expect(withdrawnId).toBeNull();
  });

  it('rejects a read-only thread, an unready attachment and someone else\u2019s file', async () => {
    const seeded = await seedThread(t.db);
    await withTx(t.db, (tx) => setThreadReadOnly(tx, seeded.threadId, 'withdrawn'));
    const viewer = seekerViewer(seeded.seekerId);
    await expect(
      sendMessage(t.db, viewer, seeded.threadId, { clientId: newId(), body: 'Hi' }),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'read_only' } });

    const open = await seedThread(t.db);
    const scanning = await seedAttachment(t.db, { ownerUserId: open.seekerId, status: 'scanning' });
    await expect(
      sendMessage(t.db, seekerViewer(open.seekerId), open.threadId, {
        clientId: newId(),
        body: 'File',
        attachmentMediaIds: [scanning],
      }),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'attachment_not_ready' } });

    const other = await seedAttachment(t.db, { ownerUserId: open.ownerId });
    await expect(
      sendMessage(t.db, seekerViewer(open.seekerId), open.threadId, {
        clientId: newId(),
        body: 'Theirs',
        attachmentMediaIds: [other],
      }),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'attachment_not_ready' } });
  });

  it('sends a pdf the sender owns and returns the same message for a repeated client id', async () => {
    const seeded = await seedThread(t.db);
    const mediaId = await seedAttachment(t.db, {
      ownerUserId: seeded.seekerId,
      mime: 'application/pdf',
    });
    const clientId = newId();
    const sent = await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
      clientId,
      body: 'My resume',
      attachmentMediaIds: [mediaId],
    });
    const view = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(view.messages.find((message) => message.id === sent.message.id)?.attachments).toEqual([
      { mediaId, mime: 'application/pdf' },
    ]);
    const again = await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
      clientId,
      body: 'My resume',
      attachmentMediaIds: [mediaId],
    });
    expect(again.message.id).toBe(sent.message.id);
    const [rows] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.messages where thread_id = ${seeded.threadId}`,
    );
    expect(rows?.n).toBe(1);
  });
});

describe('trust and reports', () => {
  it('registers message and thread report subjects, and hides a removed message', async () => {
    const message = safetyFake.subjects.find((subject) => subject.type === 'message');
    const thread = safetyFake.subjects.find((subject) => subject.type === 'thread');
    expect(message?.registration.trustSubjectType).toBe('message');
    expect(thread?.registration.trustSubjectType).toBe('thread');

    const seeded = await seedThread(t.db);
    const sent = await sendMessage(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), seeded.threadId, {
      clientId: newId(),
      body: '__block__',
    });
    await runWorker(t.db, { handlers: jobHandlers });
    const held = await listOpenReviewItems(t.db, 'message', sent.message.id);
    const item = held.find((row) => row.reason === 'message_scam_held');
    expect(item).toBeDefined();
    await decide(t.db, item?.id ?? '', operatorId, 'remove');
    const seeker = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(seeker.messages.map((row) => row.id)).not.toContain(sent.message.id);
    expect(await message?.registration.exists(t.db, sent.message.id)).toBe(false);
  });

  it('delivers a held message when the item is approved and notifies the seeker', async () => {
    const seeded = await seedThread(t.db);
    const sent = await sendMessage(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), seeded.threadId, {
      clientId: newId(),
      body: '__block__',
    });
    await runWorker(t.db, { handlers: jobHandlers });
    const [item] = await listOpenReviewItems(t.db, 'message', sent.message.id);
    await decide(t.db, item?.id ?? '', operatorId, 'approve');
    const seeker = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(seeker.messages.map((row) => row.id)).toContain(sent.message.id);
    const [notes] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.notifications
          where user_id = ${seeded.seekerId} and type = 'messages.new'`,
    );
    expect(notes?.n).toBe(1);
  });

  it('makes a removed thread read-only', async () => {
    const seeded = await seedThread(t.db);
    const opened = await listOpenReviewItems(t.db, 'thread', seeded.threadId);
    expect(opened).toEqual([]);
    const { openReviewItem } = await import('@/modules/trust');
    const item = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'thread',
      subjectId: seeded.threadId,
      reason: 'report',
    });
    await decide(t.db, item.id, operatorId, 'remove');
    await expect(
      getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId),
    ).resolves.toMatchObject({ readOnly: 'removed' });
  });
});

describe('releasing a message later', () => {
  it('does not deliver a scanned host message once the seeker has blocked the org', async () => {
    const seeded = await seedThread(t.db);
    const host = hostViewer(seeded.ownerId, seeded.orgId, 'owner');
    const sent = await sendMessage(t.db, host, seeded.threadId, {
      clientId: newId(),
      body: 'On my way',
    });
    safetyFake.setBlocked(seeded.orgId, seeded.seekerId, 'user');
    await runWorker(t.db, { handlers: jobHandlers });

    const seeker = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(seeker.messages.map((row) => row.id)).not.toContain(sent.message.id);
    expect(seeker.readOnly).toBe('blocked');
    const hostView = await getThread(t.db, host, seeded.threadId);
    expect(hostView.messages.find((row) => row.id === sent.message.id)?.state).toBe('not_delivered');
    // The host is never told that the seeker blocked them.
    expect(hostView.readOnly).toBe('unavailable');
    expect(await seekerNotes(seeded.seekerId)).toBe(0);
    const [thread] = await t.db.select().from(threads).where(eq(threads.id, seeded.threadId));
    expect(thread?.lastToSeekerAt).toBeNull();
  });

  it('does not deliver an approved held message once the seeker has blocked the org', async () => {
    const seeded = await seedThread(t.db);
    const sent = await sendMessage(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), seeded.threadId, {
      clientId: newId(),
      body: '__block__',
    });
    await runWorker(t.db, { handlers: jobHandlers });
    safetyFake.setBlocked(seeded.orgId, seeded.seekerId, 'user');
    const [item] = await listOpenReviewItems(t.db, 'message', sent.message.id);
    await decide(t.db, item?.id ?? '', operatorId, 'approve');

    const seeker = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(seeker.messages.map((row) => row.id)).not.toContain(sent.message.id);
    expect(await seekerNotes(seeded.seekerId)).toBe(0);
    const [row] = await t.db.select().from(messages).where(eq(messages.id, sent.message.id));
    expect(row?.scanState).toBe('held');
  });

  it('never brings a removed message back when another item on it is approved later', async () => {
    const seeded = await seedThread(t.db);
    const sent = await sendMessage(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), seeded.threadId, {
      clientId: newId(),
      body: 'Deposit first __flag__',
    });
    await runWorker(t.db, { handlers: jobHandlers });
    await decideMessage(t.db, sent.message.id, 'remove');
    await decideMessage(t.db, sent.message.id, 'approve');
    const [row] = await t.db.select().from(messages).where(eq(messages.id, sent.message.id));
    expect(row?.scanState).toBe('removed');
    const seeker = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(seeker.messages.map((message) => message.id)).not.toContain(sent.message.id);
  });

  it('marks the thread unread when a message is released after the seeker last read it', async () => {
    const minute = 60_000;
    const scanned = await seedThread(t.db);
    const approved = await seedThread(t.db);
    const ids: Record<string, string> = {};
    for (const [seeded, body] of [
      [scanned, 'On my way'],
      [approved, '__block__'],
    ] as const) {
      const sent = await sendMessage(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), seeded.threadId, {
        clientId: newId(),
        body,
      });
      ids[seeded.threadId] = sent.message.id;
      await t.db
        .update(messages)
        .set({ createdAt: new Date(Date.now() - 10 * minute) })
        .where(eq(messages.id, sent.message.id));
      await t.db.insert(threadReads).values({
        threadId: seeded.threadId,
        userId: seeded.seekerId,
        lastReadAt: new Date(Date.now() - 5 * minute),
      });
    }
    await runWorker(t.db, { handlers: jobHandlers });
    const [item] = await listOpenReviewItems(t.db, 'message', ids[approved.threadId] ?? '');
    await decide(t.db, item?.id ?? '', operatorId, 'approve');

    for (const seeded of [scanned, approved]) {
      const list = await listThreads(t.db, seekerViewer(seeded.seekerId));
      expect(list.items.find((row) => row.threadId === seeded.threadId)?.unread).toBe(true);
      expect(await unreadThreadCount(t.db, seeded.seekerId)).toBe(1);
    }
  });

  // An item can be open on a message the scan has not released yet: the scan opens it before
  // it stores the state, and a report can land on it.
  async function pendingWithItem(body: string) {
    const seeded = await seedThread(t.db);
    const host = hostViewer(seeded.ownerId, seeded.orgId, 'owner');
    const sent = await sendMessage(t.db, host, seeded.threadId, { clientId: newId(), body });
    const { openReviewItem } = await import('@/modules/trust');
    const item = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'message',
      subjectId: sent.message.id,
      reason: 'report',
    });
    return { seeded, host, messageId: sent.message.id, itemId: item.id };
  }

  it('delivers a pending message when an operator approves it, as a scan release does', async () => {
    const minute = 60_000;
    const { seeded, messageId, itemId } = await pendingWithItem('On my way');
    await t.db
      .update(messages)
      .set({ createdAt: new Date(Date.now() - 10 * minute) })
      .where(eq(messages.id, messageId));
    await t.db.insert(threadReads).values({
      threadId: seeded.threadId,
      userId: seeded.seekerId,
      lastReadAt: new Date(Date.now() - 5 * minute),
    });
    const before = Date.now();
    await decide(t.db, itemId, operatorId, 'approve');

    const [row] = await t.db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.scanState).toBe('clear');
    const seeker = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(seeker.messages.map((message) => message.id)).toContain(messageId);
    expect(await seekerNotes(seeded.seekerId)).toBe(1);
    const [thread] = await t.db.select().from(threads).where(eq(threads.id, seeded.threadId));
    expect(thread?.lastToSeekerAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(thread?.firstHostReplyAt).toEqual(row?.createdAt);
    const list = await listThreads(t.db, seekerViewer(seeded.seekerId));
    expect(list.items.find((card) => card.threadId === seeded.threadId)).toMatchObject({
      unread: true,
      lastMessage: { preview: 'On my way' },
    });

    // The scan job queued at send finds the message released and delivers nothing more.
    await runWorker(t.db, { handlers: jobHandlers });
    expect(await seekerNotes(seeded.seekerId)).toBe(1);
    const [after] = await t.db.select().from(messages).where(eq(messages.id, messageId));
    expect(after?.scanState).toBe('clear');
  });

  it('holds an approved pending message once the seeker has blocked the org', async () => {
    const { seeded, host, messageId, itemId } = await pendingWithItem('On my way');
    safetyFake.setBlocked(seeded.orgId, seeded.seekerId);
    await decide(t.db, itemId, operatorId, 'approve');

    const [row] = await t.db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.scanState).toBe('held');
    const seeker = await getThread(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(seeker.messages.map((message) => message.id)).not.toContain(messageId);
    expect(seeker.readOnly).toBe('blocked');
    const hostView = await getThread(t.db, host, seeded.threadId);
    expect(hostView.messages.find((message) => message.id === messageId)?.state).toBe(
      'not_delivered',
    );
    expect(await seekerNotes(seeded.seekerId)).toBe(0);
    const [thread] = await t.db.select().from(threads).where(eq(threads.id, seeded.threadId));
    expect(thread?.lastToSeekerAt).toBeNull();
  });

  it('holds an approved pending message on a thread that became read-only', async () => {
    const { seeded, messageId, itemId } = await pendingWithItem('On my way');
    await withTx(t.db, (tx) => setThreadReadOnly(tx, seeded.threadId, 'withdrawn'));
    await decide(t.db, itemId, operatorId, 'approve');

    const [row] = await t.db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.scanState).toBe('held');
    expect(await seekerNotes(seeded.seekerId)).toBe(0);
    const [thread] = await t.db.select().from(threads).where(eq(threads.id, seeded.threadId));
    expect(thread?.lastToSeekerAt).toBeNull();
  });
});

describe('one client id, two sends', () => {
  it('returns the stored message when a send with the same client id lands in between', async () => {
    const seeded = await seedThread(t.db);
    const cases = [
      {
        viewer: seekerViewer(seeded.seekerId),
        mediaId: await seedAttachment(t.db, { ownerUserId: seeded.seekerId }),
      },
      {
        viewer: hostViewer(seeded.ownerId, seeded.orgId, 'owner'),
        mediaId: await seedAttachment(t.db, { ownerUserId: seeded.ownerId, ownerOrgId: seeded.orgId }),
      },
    ];
    for (const { viewer, mediaId } of cases) {
      const input = { clientId: newId(), body: 'My resume', attachmentMediaIds: [mediaId] };
      let first: string | undefined;
      race.beforeAttachmentCheck = async () => {
        first = (await sendMessage(t.db, viewer, seeded.threadId, input)).message.id;
      };
      const second = await sendMessage(t.db, viewer, seeded.threadId, input);
      expect(first).toBeDefined();
      expect(second.message.id).toBe(first);
      expect(second.message.attachments).toEqual([{ mediaId, mime: 'application/pdf' }]);
      const [rows] = await queryRows<{ n: number }>(
        t.db,
        sql`select count(*)::int as n from app.messages
            where thread_id = ${seeded.threadId} and client_id = ${input.clientId}`,
      );
      expect(rows?.n).toBe(1);
    }
    const [jobs] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox
          where topic = 'messaging.scan' and payload->>'messageId' in (
            select id::text from app.messages where thread_id = ${seeded.threadId} and sender_type = 'host'
          )`,
    );
    expect(jobs?.n).toBe(1);
  });
});
