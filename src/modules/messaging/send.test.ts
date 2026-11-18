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
import { messages, threads } from './schema';
import { sendHostMessage, sendMessage } from './send';
import { hostViewer, seedAttachment, seedThread, seekerViewer } from './test-fixture';
import { getThread, markThreadHired, setThreadReadOnly } from './threads';

vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));

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
