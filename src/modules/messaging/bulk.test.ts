import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { decide, listOpenReviewItems } from '@/modules/trust';
// The operator seed is a trust test helper and is not on the trust public index.
// eslint-disable-next-line no-restricted-imports
import { addOperator } from '@/modules/trust/test-fixtures';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { safetyFake } from '@tests/fakes/sp5/sp4';
import { createBulkMessage } from './bulk';
import './notification-types';
import { jobHandlers } from './jobs';
import { bulkMessages, messages, threads } from './schema';
import { getMessageForReview } from './review';
import { seedHostOrg, seedSeeker } from './test-fixtures';

vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));
vi.mock('./scan', async (orig) => {
  const actual = await orig<typeof import('./scan')>();
  return { ...actual, scanHostText: vi.fn(actual.scanHostText) };
});

import * as scan from './scan';

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
  vi.mocked(scan.scanHostText).mockClear();
});

async function applicants(orgId: string, listingId: string, count: number, readOnlyAt?: number) {
  const applicationIds: string[] = [];
  const threadIds: string[] = [];
  for (let n = 0; n < count; n += 1) {
    const seeker = await seedSeeker(t.db);
    const applicationId = newId();
    const threadId = newId();
    await t.db.insert(threads).values({
      id: threadId,
      orgId,
      listingId,
      seekerUserId: seeker.userId,
      applicationId,
      readOnlyReason: readOnlyAt === n ? 'withdrawn' : null,
    });
    applicationIds.push(applicationId);
    threadIds.push(threadId);
  }
  return { applicationIds, threadIds };
}

describe('bulk messages', () => {
  it('skips a read-only thread, scans the template once, and refuses more than 200', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    const { applicationIds, threadIds } = await applicants(org.orgId, listingId, 3, 0);
    const created = await createBulkMessage(t.db, org.owner.ctx, {
      listingId,
      statuses: ['new'],
      body: 'Still hiring',
      applicationIds,
    });
    expect(created.recipients).toBe(2);
    await runWorker(t.db, { handlers: jobHandlers });
    const sent = await t.db.select().from(messages).where(eq(messages.bulkId, created.bulkId));
    expect(sent).toHaveLength(2);
    expect(sent.every((row) => threadIds.slice(1).includes(row.threadId))).toBe(true);
    expect(scan.scanHostText).toHaveBeenCalledTimes(1);
    expect(scan.scanHostText).toHaveBeenCalledWith(
      t.db,
      expect.objectContaining({ subjectType: 'bulk_message', subjectId: created.bulkId }),
    );

    const manyOrg = await seedHostOrg(t.db);
    const manyListing = newId();
    const many = await applicants(manyOrg.orgId, manyListing, 201);
    await expect(
      createBulkMessage(t.db, manyOrg.owner.ctx, {
        listingId: manyListing,
        statuses: ['new'],
        body: 'Everyone',
        applicationIds: many.applicationIds,
      }),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'too_many_recipients' } });
  });

  it('stamps a block found at create, and skips a block that lands before the job', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    const seekers = [await seedSeeker(t.db), await seedSeeker(t.db), await seedSeeker(t.db)];
    const applicationIds: string[] = [];
    const threadIds: string[] = [];
    for (const seeker of seekers) {
      const applicationId = newId();
      const threadId = newId();
      await t.db.insert(threads).values({
        id: threadId,
        orgId: org.orgId,
        listingId,
        seekerUserId: seeker.userId,
        applicationId,
      });
      applicationIds.push(applicationId);
      threadIds.push(threadId);
    }
    const blockedSeeker = seekers[0];
    if (!blockedSeeker) throw new Error('expected a seeker');
    safetyFake.setBlocked(org.orgId, blockedSeeker.userId);
    const created = await createBulkMessage(t.db, org.owner.ctx, {
      listingId,
      statuses: ['new'],
      body: 'Update',
      applicationIds,
    });
    expect(created.recipients).toBe(2);
    const [blocked] = await t.db.select().from(threads).where(eq(threads.id, threadIds[0] ?? ''));
    expect(blocked?.readOnlyReason).toBe('blocked');
    await runWorker(t.db, { handlers: jobHandlers });
    const onBlocked = await t.db
      .select()
      .from(messages)
      .where(eq(messages.threadId, threadIds[0] ?? ''));
    expect(onBlocked).toHaveLength(0);

    const later = await seedHostOrg(t.db);
    const laterListing = newId();
    const laterSeekers = [await seedSeeker(t.db), await seedSeeker(t.db)];
    const laterApps: string[] = [];
    const laterThreads: string[] = [];
    for (const seeker of laterSeekers) {
      const applicationId = newId();
      const threadId = newId();
      await t.db.insert(threads).values({
        id: threadId,
        orgId: later.orgId,
        listingId: laterListing,
        seekerUserId: seeker.userId,
        applicationId,
      });
      laterApps.push(applicationId);
      laterThreads.push(threadId);
    }
    const second = await createBulkMessage(t.db, later.owner.ctx, {
      listingId: laterListing,
      statuses: ['new'],
      body: 'Follow up',
      applicationIds: laterApps,
    });
    expect(second.recipients).toBe(2);
    const laterBlocked = laterSeekers[0];
    if (!laterBlocked) throw new Error('expected a seeker');
    safetyFake.setBlocked(later.orgId, laterBlocked.userId);
    await runWorker(t.db, { handlers: jobHandlers });
    const [bulk] = await t.db.select().from(bulkMessages).where(eq(bulkMessages.id, second.bulkId));
    expect(bulk?.sentCount).toBe(1);
    const missed = await t.db
      .select()
      .from(messages)
      .where(eq(messages.threadId, laterThreads[0] ?? ''));
    expect(missed).toHaveLength(0);
  });

  it('holds a blocked template, sends once when approved, and keeps a removed bulk held', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    const { applicationIds, threadIds } = await applicants(org.orgId, listingId, 2);
    const created = await createBulkMessage(t.db, org.owner.ctx, {
      listingId,
      statuses: ['new'],
      body: 'Pay a deposit __block__',
      applicationIds,
    });
    await runWorker(t.db, { handlers: jobHandlers });
    const [held] = await t.db.select().from(bulkMessages).where(eq(bulkMessages.id, created.bulkId));
    expect(held?.scanState).toBe('held');
    expect(await t.db.select().from(messages).where(eq(messages.bulkId, created.bulkId))).toHaveLength(0);
    const items = await listOpenReviewItems(t.db, 'bulk_message', created.bulkId);
    expect(items.some((item) => item.queue === 'moderation')).toBe(true);
    await expect(
      getMessageForReview(t.db, created.bulkId, { subjectType: 'bulk_message' }),
    ).resolves.toMatchObject({ body: 'Pay a deposit __block__' });

    const item = items.find((row) => row.reason === 'message_scam_held') ?? items[0];
    await decide(t.db, item?.id ?? '', operatorId, 'approve');
    await runWorker(t.db, { handlers: jobHandlers });
    const delivered = await t.db.select().from(messages).where(eq(messages.bulkId, created.bulkId));
    expect(delivered).toHaveLength(threadIds.length);
    expect(delivered.every((row) => row.scanState === 'clear')).toBe(true);
    expect(scan.scanHostText).toHaveBeenCalledTimes(1);
    for (const threadId of threadIds) {
      const [thread] = await t.db.select().from(threads).where(eq(threads.id, threadId));
      const [notes] = await queryRows<{ n: number }>(
        t.db,
        sql`select count(*)::int as n from app.notifications
            where user_id = ${thread?.seekerUserId ?? ''} and type = 'messages.new'`,
      );
      expect(notes?.n).toBe(1);
    }
    await runWorker(t.db, { handlers: jobHandlers });
    expect(await t.db.select().from(messages).where(eq(messages.bulkId, created.bulkId))).toHaveLength(
      threadIds.length,
    );

    const other = await createBulkMessage(t.db, org.owner.ctx, {
      listingId,
      statuses: ['new'],
      body: 'Another __block__',
      applicationIds,
    });
    await runWorker(t.db, { handlers: jobHandlers });
    const otherItems = await listOpenReviewItems(t.db, 'bulk_message', other.bulkId);
    await decide(t.db, otherItems[0]?.id ?? '', operatorId, 'remove');
    const [removed] = await t.db.select().from(bulkMessages).where(eq(bulkMessages.id, other.bulkId));
    expect(removed?.scanState).toBe('held');
    expect(await t.db.select().from(messages).where(eq(messages.bulkId, other.bulkId))).toHaveLength(0);
  });
});
