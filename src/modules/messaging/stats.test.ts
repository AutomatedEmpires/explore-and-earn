import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
// The hostpages index exports registration only. The slot lookup stays on the provider file.
// eslint-disable-next-line no-restricted-imports
import { getHostPageProvider } from '@/modules/hostpages/providers';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { listingsFake } from '@tests/fakes/sp5/sp2';
import { threads } from './schema';
import { getReplyStats, runMessagingDaily } from './stats';
import { seedHostOrg, seedSeeker } from './test-fixture';
import './register';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));

let t: TestDb;
const minute = 60_000;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  listingsFake.reset();
});

async function conversation(
  orgId: string,
  seekerId: string,
  replyMinutes: number | null,
  ageMinutes: number,
) {
  const createdAt = new Date(Date.now() - ageMinutes * minute);
  await t.db.insert(threads).values({
    id: newId(),
    orgId,
    listingId: newId(),
    seekerUserId: seekerId,
    applicationId: newId(),
    createdAt,
    firstHostReplyAt:
      replyMinutes === null ? null : new Date(createdAt.getTime() + replyMinutes * minute),
  });
}

describe('reply stats', () => {
  it('takes the median of 60, 120 and 2000 minutes and treats that as within a day', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    for (const minutes of [60, 120, 2000]) {
      await conversation(org.orgId, seeker.userId, minutes, minutes + 30);
    }
    const stats = await getReplyStats(t.db, org.orgId);
    expect(stats.medianFirstReplyMinutes).toBe(120);
    expect(stats.usuallyRepliesWithinDay).toBe(true);
  });

  it('caps an unanswered 10-day thread at 7 days and leaves out a 2-hour-old one', async () => {
    const old = await seedHostOrg(t.db);
    const oldSeeker = await seedSeeker(t.db);
    await conversation(old.orgId, oldSeeker.userId, null, 10 * 24 * 60);
    expect((await getReplyStats(t.db, old.orgId)).medianFirstReplyMinutes).toBe(10_080);

    const fresh = await seedHostOrg(t.db);
    const freshSeeker = await seedSeeker(t.db);
    await conversation(fresh.orgId, freshSeeker.userId, null, 2 * 60);
    expect((await getReplyStats(t.db, fresh.orgId)).medianFirstReplyMinutes).toBeNull();
  });

  it('hides the host page reply time below 10 conversations', async () => {
    const provider = getHostPageProvider('reply_time');
    expect(provider).toBeDefined();
    const small = await seedHostOrg(t.db);
    const smallSeeker = await seedSeeker(t.db);
    for (let n = 0; n < 9; n += 1) await conversation(small.orgId, smallSeeker.userId, 60, 120);
    expect(await provider?.fn(t.db, small.orgId)).toBeNull();

    const enough = await seedHostOrg(t.db);
    const enoughSeeker = await seedSeeker(t.db);
    for (let n = 0; n < 10; n += 1) await conversation(enough.orgId, enoughSeeker.userId, 60, 120);
    expect(await provider?.fn(t.db, enough.orgId)).toEqual({ conversations: 10, withinADay: true });
  });

  it('stamps listing_closed_at from the listing the daily job reads', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
    const threadId = newId();
    const closedAt = new Date('2026-06-01T00:00:00.000Z');
    listingsFake.setListing({ id: listingId, orgId: org.orgId, closedAt, title: 'Lift' });
    await t.db.insert(threads).values({
      id: threadId,
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
    });
    await runMessagingDaily(t.db, new Date('2026-06-02T00:00:00.000Z'));
    const [row] = await t.db.select().from(threads).where(eq(threads.id, threadId));
    expect(row?.listingClosedAt?.toISOString()).toBe(closedAt.toISOString());
  });
});
