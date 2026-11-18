import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { flushBatches, jobHandlers as notificationJobs, stubOutbox } from '@/modules/notifications';
import { setSetting } from '@/modules/settings';
import { getCounts } from '@/server/counts';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { jobHandlers as messagingJobs } from './jobs';
import { threads } from './schema';
import { sendMessage } from './send';
import { hostViewer, seedMember, seedThread, seekerViewer } from './test-fixtures';
import { markThreadRead, unreadThreadCount } from './reads';

const ADDRESS = '1 Harbor Road, Juneau, AK 99801';
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await setSetting(t.db, 'business.mailing_address', ADDRESS, { operatorId: newId() });
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  stubOutbox.length = 0;
});

async function releaseHostMessage(body: string) {
  const seeded = await seedThread(t.db);
  const sent = await sendMessage(t.db, hostViewer(seeded.ownerId, seeded.orgId, 'owner'), seeded.threadId, {
    clientId: newId(),
    body,
  });
  await runWorker(t.db, { handlers: { ...notificationJobs, ...messagingJobs } });
  return { seeded, messageId: sent.message.id };
}

describe('message email', () => {
  it('sends one digest 15 minutes later, without the message body', async () => {
    const body = 'UNIQUE-BODY-XYZZY bring boots';
    const { seeded } = await releaseHostMessage(body);
    const [note] = await queryRows<{ data: unknown; n: number }>(
      t.db,
      sql`select data, count(*) over ()::int as n from app.notifications
          where user_id = ${seeded.seekerId} and type = 'messages.new'`,
    );
    expect(note?.n).toBe(1);
    expect(JSON.stringify(note?.data)).not.toContain(body);

    const [batch] = await queryRows<{ send_after: string }>(
      t.db,
      sql`select send_after from app.notification_batches
          where user_id = ${seeded.seekerId} and status = 'pending'`,
    );
    expect(batch?.send_after).toBeTruthy();
    const due = new Date(batch?.send_after ?? 0);
    expect(due.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);

    expect(await flushBatches(t.db, new Date(due.getTime() + 1000))).toMatchObject({ queued: 1 });
    await runWorker(t.db, { handlers: notificationJobs });
    expect(stubOutbox).toHaveLength(1);
    const mail = stubOutbox[0];
    expect(mail?.html).toContain('Reply in app');
    expect(mail?.html ?? '').not.toContain(body);
    expect(mail?.text ?? '').not.toContain(body);
  });

  it('skips the digest when the thread was read before the batch was due', async () => {
    const { seeded } = await releaseHostMessage('See you then');
    await markThreadRead(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    const [batch] = await queryRows<{ send_after: string }>(
      t.db,
      sql`select send_after from app.notification_batches where user_id = ${seeded.seekerId}`,
    );
    const due = new Date(batch?.send_after ?? 0);
    expect(await flushBatches(t.db, new Date(due.getTime() + 1000))).toEqual({ queued: 0, skipped: 1 });
    await runWorker(t.db, { handlers: notificationJobs });
    expect(stubOutbox).toHaveLength(0);
  });
});

describe('unread counts', () => {
  it('drops to zero after the seeker reads, and stays zero for an out-of-scope recruiter', async () => {
    const seeded = await seedThread(t.db);
    await t.db
      .update(threads)
      .set({ lastToSeekerAt: new Date(), lastToHostAt: new Date() })
      .where(eq(threads.id, seeded.threadId));
    expect(await unreadThreadCount(t.db, seeded.seekerId)).toBe(1);
    expect(await getCounts(t.db, seeded.seekerId)).toMatchObject({ inbox: 1 });
    await markThreadRead(t.db, seekerViewer(seeded.seekerId), seeded.threadId);
    expect(await unreadThreadCount(t.db, seeded.seekerId)).toBe(0);

    const admin = await seedMember(t.db, seeded.orgId, 'admin');
    const recruiter = await seedMember(t.db, seeded.orgId, 'recruiter', { scope: 'assigned' });
    expect(await unreadThreadCount(t.db, admin.userId)).toBe(1);
    expect(await unreadThreadCount(t.db, recruiter.userId)).toBe(0);
  });
});
