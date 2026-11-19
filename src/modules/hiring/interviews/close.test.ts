import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews, notifications, offers } from '@/db/schema';
import { withTx, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedInterview, seedOffer, seedSeeker } from '@tests/helpers/sp5';
import { closeOpenItems } from './close';

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

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
});

async function openPair() {
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
  const threadId = newId();
  const interviewId = await seedInterview(t.db, {
    orgId: org.orgId,
    listingId,
    applicationId,
    threadId,
    organizerUserId: org.owner.userId,
    status: 'scheduled',
  });
  const start = new Date('2027-06-01T15:00:00Z');
  await t.db
    .update(interviews)
    .set({ scheduledStart: start, scheduledEnd: new Date(start.getTime() + 30 * 60_000), sequence: 2, status: 'scheduled' })
    .where(eq(interviews.id, interviewId));
  const offerId = await seedOffer(t.db, {
    orgId: org.orgId,
    listingId,
    applicationId,
    threadId,
    createdBy: org.owner.userId,
  });
  return { org, seeker, applicationId, interviewId, offerId };
}

describe('closeOpenItems', () => {
  it('cancels the interview and offer, telling the organizer when the seeker withdrew', async () => {
    const pair = await openPair();
    await withTx(t.db as Db, (tx) => closeOpenItems(tx, { applicationId: pair.applicationId, reason: 'withdrawn' }));
    const [interview] = await t.db.select().from(interviews).where(eq(interviews.id, pair.interviewId));
    const [offer] = await t.db.select().from(offers).where(eq(offers.id, pair.offerId));
    expect(interview?.status).toBe('canceled');
    expect(interview?.sequence).toBe(3);
    expect(offer?.status).toBe('canceled');
    const notes = await t.db.select().from(notifications).where(eq(notifications.userId, pair.org.owner.userId));
    const canceled = notes.find((note) => note.type === 'hiring.interview_canceled');
    expect(canceled?.data).toMatchObject({ icsMethod: 'CANCEL' });
    const seekerNotes = await t.db.select().from(notifications).where(eq(notifications.userId, pair.seeker.userId));
    expect(seekerNotes.some((note) => note.type === 'hiring.interview_canceled')).toBe(false);
  });

  it('tells the seeker when the host passes', async () => {
    const pair = await openPair();
    await withTx(t.db as Db, (tx) => closeOpenItems(tx, { applicationId: pair.applicationId, reason: 'not_selected' }));
    const notes = await t.db.select().from(notifications).where(eq(notifications.userId, pair.seeker.userId));
    expect(notes.some((note) => note.type === 'hiring.interview_canceled')).toBe(true);
    const hostNotes = await t.db.select().from(notifications).where(eq(notifications.userId, pair.org.owner.userId));
    expect(hostNotes.some((note) => note.type === 'hiring.interview_canceled')).toBe(false);
  });
});
