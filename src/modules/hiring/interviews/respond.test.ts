import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews, interviewSlots, notifications, outbox, pipelineEvents } from '@/db/schema';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedInterview, seedSeeker } from '@tests/helpers/sp5';
import { proposeInterview } from './propose';
import { recordInterviewOutcome } from './propose';
import { listHostInterviews, listSeekerInterviews } from './reads';
import { declineInterview, pickSlot, requestNewTimes } from './respond';

vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...applicationsFake,
}));
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
const NOW = new Date('2026-11-03T17:00:00Z');
const HOUR = 60 * 60_000;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
});

function slotId(view: { slots: { id: string }[] }): string {
  const chosen = view.slots[0];
  if (!chosen) throw new Error('expected a slot');
  return chosen.id;
}

async function open(hoursAhead: number) {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status: 'interviewing',
  });
  const start = new Date(NOW.getTime() + hoursAhead * HOUR);
  const view = await proposeInterview(
    t.db as Db,
    org.owner.ctx,
    applicationId,
    { slots: [{ start: start.toISOString() }], durationMinutes: 30, format: 'phone', expiryHours: 72 },
    NOW,
  );
  return { org, seeker, listingId, applicationId, view, start };
}

describe('seeker interview answers', () => {
  it('rejects a slot that has already passed', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
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
      slots: [{ startsAt: new Date(NOW.getTime() - HOUR), endsAt: NOW }],
    });
    const [slot] = await t.db.select().from(interviewSlots).where(eq(interviewSlots.interviewId, interviewId));
    if (!slot) throw new Error('expected a slot');
    await expect(
      pickSlot(t.db as Db, seeker.userId, interviewId, { slotId: slot.id, round: 1 }, NOW),
    ).rejects.toMatchObject({ details: { reason: 'slot_passed' } });
  });

  it('books the slot, notifies both people, and queues the reminders that still fit', async () => {
    const booked = await open(48);
    const item = await pickSlot(
      t.db as Db,
      booked.seeker.userId,
      booked.view.id,
      { slotId: slotId(booked.view), round: 1 },
      NOW,
    );
    expect(item.status).toBe('scheduled');
    const [row] = await t.db.select().from(interviews).where(eq(interviews.id, booked.view.id));
    expect(row?.sequence).toBe(1);
    expect(row?.scheduledEnd?.toISOString()).toBe(new Date(booked.start.getTime() + 30 * 60_000).toISOString());
    const jobs = await t.db.select().from(outbox).where(eq(outbox.topic, 'hiring.interview_reminder'));
    const keys = jobs.map((job) => job.dedupeKey).sort();
    expect(keys).toContain(`ivr:${booked.view.id}:1:24h`);
    expect(keys).toContain(`ivr:${booked.view.id}:1:1h`);
    const day = jobs.find((job) => job.dedupeKey === `ivr:${booked.view.id}:1:24h`);
    const hour = jobs.find((job) => job.dedupeKey === `ivr:${booked.view.id}:1:1h`);
    expect(day?.availableAt.toISOString()).toBe(new Date(booked.start.getTime() - 24 * HOUR).toISOString());
    expect(hour?.availableAt.toISOString()).toBe(new Date(booked.start.getTime() - HOUR).toISOString());
    const seekerNotes = await t.db.select().from(notifications).where(eq(notifications.userId, booked.seeker.userId));
    const hostNotes = await t.db.select().from(notifications).where(eq(notifications.userId, booked.org.owner.userId));
    expect(seekerNotes.some((note) => note.type === 'hiring.interview_scheduled')).toBe(true);
    expect(hostNotes.some((note) => note.type === 'hiring.interview_scheduled')).toBe(true);

    const soon = await open(20);
    await pickSlot(t.db as Db, soon.seeker.userId, soon.view.id, { slotId: slotId(soon.view), round: 1 }, NOW);
    const soonJobs = await t.db.select().from(outbox);
    expect(soonJobs.some((job) => job.dedupeKey === `ivr:${soon.view.id}:1:24h`)).toBe(false);
    expect(soonJobs.some((job) => job.dedupeKey === `ivr:${soon.view.id}:1:1h`)).toBe(true);
  });

  it('asks for new times and declines with a withdrawal', async () => {
    const four = await open(48);
    await expect(
      requestNewTimes(
        t.db as Db,
        four.seeker.userId,
        four.view.id,
        {
          windows: [0, 1, 2, 3].map((n) => ({
            start: new Date(NOW.getTime() + (10 + n) * HOUR).toISOString(),
            end: new Date(NOW.getTime() + (11 + n) * HOUR).toISOString(),
          })),
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'too_many_windows' } });
    await expect(
      requestNewTimes(
        t.db as Db,
        four.seeker.userId,
        four.view.id,
        {
          windows: [{ start: new Date(NOW.getTime() + 10 * HOUR).toISOString(), end: new Date(NOW.getTime() + 10 * HOUR + 20 * 60_000).toISOString() }],
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'window_too_short' } });

    const asked = await open(48);
    await pickSlot(t.db as Db, asked.seeker.userId, asked.view.id, { slotId: slotId(asked.view), round: 1 }, NOW);
    await requestNewTimes(
      t.db as Db,
      asked.seeker.userId,
      asked.view.id,
      {
        windows: [{ start: new Date(NOW.getTime() + 10 * HOUR).toISOString(), end: new Date(NOW.getTime() + 12 * HOUR).toISOString() }],
      },
      NOW,
    );
    const [row] = await t.db.select().from(interviews).where(eq(interviews.id, asked.view.id));
    expect(row?.status).toBe('reschedule_requested');
    expect(row?.expiresAt).toBeNull();
    const listed = await listHostInterviews(
      t.db,
      asked.org.owner.ctx,
      { from: NOW.toISOString(), to: new Date(NOW.getTime() + 90 * 24 * HOUR).toISOString(), needsAction: true },
      NOW,
    );
    expect(listed.items.find((item) => item.interviewId === asked.view.id)?.needsAction).toBe(true);
    const hostNotes = await t.db.select().from(notifications).where(eq(notifications.userId, asked.org.owner.userId));
    const askedNote = hostNotes.find((note) => note.type === 'hiring.interview_times_requested');
    expect(askedNote?.data).toMatchObject({ icsMethod: 'CANCEL' });

    const declined = await open(48);
    const result = await declineInterview(
      t.db as Db,
      declined.seeker.userId,
      declined.view.id,
      { alsoWithdraw: true },
      NOW,
    );
    expect(result.withdrawn).toBe(true);
    const withdraw = applicationsFake.calls.find((call) => call.name === 'withdraw');
    expect(withdraw?.args[0]).toMatchObject({
      applicationId: declined.applicationId,
      seekerUserId: declined.seeker.userId,
    });
  });

  it('records an outcome only after the interview ends', async () => {
    const early = await open(48);
    await pickSlot(t.db as Db, early.seeker.userId, early.view.id, { slotId: slotId(early.view), round: 1 }, NOW);
    await expect(
      recordInterviewOutcome(t.db as Db, early.org.owner.ctx, early.view.id, 'completed', NOW),
    ).rejects.toMatchObject({ details: { reason: 'not_yet_passed' } });

    const done = await open(48);
    await pickSlot(t.db as Db, done.seeker.userId, done.view.id, { slotId: slotId(done.view), round: 1 }, NOW);
    const after = new Date(done.start.getTime() + 31 * 60_000);
    await recordInterviewOutcome(t.db as Db, done.org.owner.ctx, done.view.id, 'completed', after);
    const events = await t.db.select().from(pipelineEvents).where(eq(pipelineEvents.applicationId, done.applicationId));
    expect(events.filter((event) => event.kind === 'interview_completed')).toHaveLength(1);

    const missed = await open(48);
    await pickSlot(t.db as Db, missed.seeker.userId, missed.view.id, { slotId: slotId(missed.view), round: 1 }, NOW);
    messagingFake.reset();
    await recordInterviewOutcome(
      t.db as Db,
      missed.org.owner.ctx,
      missed.view.id,
      'no_show',
      new Date(missed.start.getTime() + 31 * 60_000),
    );
    const posted = messagingFake.calls.find((call) => call.name === 'postEvent');
    expect(posted?.args[1]).toMatchObject({ code: 'interview_no_show', visibleTo: 'host' });
    const seekerList = await listSeekerInterviews(t.db, missed.seeker.userId, { now: after });
    expect(seekerList.items.find((item) => item.id === missed.view.id)?.status).toBe('past');
  });
});
