import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { interviews, notifications } from '@/db/schema';
import { newId } from '@/lib/ids';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedInterview, seedSeeker } from '@tests/helpers/sp5';
import { sendInterviewReminder } from './reminders';

vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...messagingFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...orgsFake,
}));

let t: TestDb;
const START = new Date('2027-06-01T15:00:00Z');

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

async function scheduled(sequence: number, status: 'scheduled' | 'canceled' = 'scheduled') {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand' });
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge');
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status: 'interviewing',
  });
  const interviewId = await seedInterview(t.db, {
    orgId: org.orgId,
    listingId,
    applicationId,
    threadId: newId(),
    organizerUserId: org.owner.userId,
    status,
  });
  await t.db
    .update(interviews)
    .set({
      status,
      sequence,
      scheduledStart: START,
      scheduledEnd: new Date(START.getTime() + 30 * 60_000),
    })
    .where(eq(interviews.id, interviewId));
  return { org, seeker, interviewId };
}

describe('sendInterviewReminder', () => {
  it('sends only the matching sequence of an interview that is still scheduled', async () => {
    const moved = await scheduled(2);
    await sendInterviewReminder(t.db, { interviewId: moved.interviewId, sequence: 1, which: '24h' }, START);
    const silent = await t.db.select().from(notifications).where(eq(notifications.userId, moved.seeker.userId));
    expect(silent.some((row) => row.type.startsWith('hiring.interview_reminder'))).toBe(false);

    const canceled = await scheduled(1, 'canceled');
    await sendInterviewReminder(t.db, { interviewId: canceled.interviewId, sequence: 1, which: '24h' }, START);
    const canceledNotes = await t.db.select().from(notifications).where(eq(notifications.userId, canceled.seeker.userId));
    expect(canceledNotes.some((row) => row.type.startsWith('hiring.interview_reminder'))).toBe(false);

    const live = await scheduled(1);
    await sendInterviewReminder(t.db, { interviewId: live.interviewId, sequence: 1, which: '24h' }, START);
    const seekerDay = await t.db.select().from(notifications).where(eq(notifications.userId, live.seeker.userId));
    const hostDay = await t.db.select().from(notifications).where(eq(notifications.userId, live.org.owner.userId));
    expect(seekerDay.filter((row) => row.type === 'hiring.interview_reminder_24h')).toHaveLength(1);
    expect(hostDay.filter((row) => row.type === 'hiring.interview_reminder_24h')).toHaveLength(1);

    await sendInterviewReminder(t.db, { interviewId: live.interviewId, sequence: 1, which: '1h' }, START);
    const seekerHour = await t.db.select().from(notifications).where(eq(notifications.userId, live.seeker.userId));
    const hostHour = await t.db.select().from(notifications).where(eq(notifications.userId, live.org.owner.userId));
    expect(seekerHour.filter((row) => row.type === 'hiring.interview_reminder_1h')).toHaveLength(1);
    expect(hostHour.filter((row) => row.type === 'hiring.interview_reminder_1h')).toHaveLength(1);
  });
});
