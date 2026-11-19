// Interview notices to a host the applicant gate refuses (issue 222, the follow-up to 212). The
// rule: a host that `hostApplicantGate` refuses (never verified, running, needs_review,
// needs_info or failed) is never told the seeker's first name, in any notice. Its notices still
// go out, as #198 does for Not interested: "A candidate" in the title, no `firstName` in the
// data, and the name is not read for a notice only the host gets. That covers the sweep's
// expired invite and outcome nudge, the 24-hour and 1-hour reminders, the cancel when a seeker
// withdraws, and the seeker's answers. Seeker notices are unchanged, and a verified host is
// still told the name.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews, notifications } from '@/db/schema';
import { withTx, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { VerificationStatus } from '@/modules/verification';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedInterview, seedSeeker } from '@tests/helpers/sp5';
import { closeOpenItems } from './close';
import { notifyInterview } from './deliver';
import { sendInterviewReminder } from './reminders';
import { sweepInterviews } from './sweep';

const names = vi.hoisted(() => ({ getCommunityIdentities: vi.fn() }));

vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  getCommunityIdentities: names.getCommunityIdentities,
}));

let t: TestDb;
const NOW = new Date('2026-11-03T17:00:00Z');
const HOUR = 60 * 60_000;
const START = new Date('2027-06-01T15:00:00Z');
const END = new Date(START.getTime() + 30 * 60_000);
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;

type Note = typeof notifications.$inferSelect;
type Status = 'invited' | 'scheduled';

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
  names.getCommunityIdentities.mockReset();
  names.getCommunityIdentities.mockImplementation(async (_db: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { displayName: 'Maya Rodriguez', firstName: 'Maya', lastInitial: 'R', avatarMediaId: null }])),
  );
});

/**
 * An interview of a seeker named Maya for Deckhand at Kettle Ridge, organized by the owner, with
 * these times. The org's verification is `verification` from here on.
 */
async function interview(
  verification: VerificationStatus,
  status: Status,
  times: { expiresAt?: Date; start?: Date; end?: Date },
) {
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
  const [row] = await t.db
    .update(interviews)
    .set({
      status,
      sequence: 1,
      // Never past due unless the test says so, so another test's sweep leaves it alone.
      expiresAt: times.expiresAt ?? new Date(NOW.getTime() + 1000 * HOUR),
      scheduledStart: times.start ?? null,
      scheduledEnd: times.end ?? null,
    })
    .where(eq(interviews.id, interviewId))
    .returning();
  if (!row) throw new Error('expected the interview');
  orgsFake.setOrgVerification(org.orgId, verification);
  names.getCommunityIdentities.mockClear();
  return { org, seeker, applicationId, interviewId, row };
}

/** The one notice of this type to this user. */
async function only(userId: string, type: string): Promise<Note> {
  const rows = (await t.db.select().from(notifications).where(eq(notifications.userId, userId))).filter(
    (row) => row.type === type,
  );
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (!row) throw new Error(`expected one ${type}`);
  return row;
}

/** Nothing in the notice names the seeker: no `firstName` in the data, no name in the text. */
function expectNoName(note: Note): void {
  expect(note.data).not.toHaveProperty('firstName');
  expect(JSON.stringify({ title: note.title, body: note.body, data: note.data })).not.toMatch(/Maya|Rodriguez/);
}

/** The seeker's name was not read for this seeker. */
function expectNameNotRead(seekerUserId: string): void {
  const asked = names.getCommunityIdentities.mock.calls.flatMap((call) => call[1] as string[]);
  expect(asked).not.toContain(seekerUserId);
}

describe('the interview sweep, to a refused host', () => {
  it.each(REFUSED)('tells the organizer an invite expired without the name while verification is %s', async (status) => {
    const s = await interview(status, 'invited', { expiresAt: new Date(NOW.getTime() - HOUR) });

    await sweepInterviews(t.db, NOW);

    const note = await only(s.org.owner.userId, 'hiring.interview_expired');
    expect(note.title).toBe('Interview invite expired: Deckhand');
    expect(note.data).toMatchObject({
      interviewId: s.interviewId,
      audience: 'host',
      orgName: 'Kettle Ridge',
      position: 'Deckhand',
    });
    expectNoName(note);
    expectNameNotRead(s.seeker.userId);
  });

  it('tells a verified organizer the name with the expired invite', async () => {
    const s = await interview('verified', 'invited', { expiresAt: new Date(NOW.getTime() - HOUR) });

    await sweepInterviews(t.db, NOW);

    const note = await only(s.org.owner.userId, 'hiring.interview_expired');
    expect(note.data).toMatchObject({ interviewId: s.interviewId, audience: 'host', firstName: 'Maya' });
  });

  it.each(REFUSED)('nudges the organizer for the outcome as "a candidate" while verification is %s', async (status) => {
    const s = await interview(status, 'scheduled', {
      start: new Date(NOW.getTime() - 2 * HOUR),
      end: new Date(NOW.getTime() - HOUR),
    });

    await sweepInterviews(t.db, NOW);

    const note = await only(s.org.owner.userId, 'hiring.interview_outcome_due');
    expect(note.title).toBe('How did the interview with a candidate go?');
    expect(note.data).toMatchObject({ interviewId: s.interviewId, audience: 'host', position: 'Deckhand' });
    expectNoName(note);
    expectNameNotRead(s.seeker.userId);
    const [row] = await t.db.select().from(interviews).where(eq(interviews.id, s.interviewId));
    expect(row?.outcomeNudgedAt).toEqual(NOW);
  });

  it('nudges a verified organizer with the name', async () => {
    const s = await interview('verified', 'scheduled', {
      start: new Date(NOW.getTime() - 2 * HOUR),
      end: new Date(NOW.getTime() - HOUR),
    });

    await sweepInterviews(t.db, NOW);

    const note = await only(s.org.owner.userId, 'hiring.interview_outcome_due');
    expect(note.title).toBe('How did the interview with Maya go?');
    expect(note.data).toMatchObject({ firstName: 'Maya' });
  });
});

const REMINDERS = [
  ['24h', 'hiring.interview_reminder_24h', 'Interview tomorrow: Deckhand'],
  ['1h', 'hiring.interview_reminder_1h', 'Interview in 1 hour: Deckhand'],
] as const;

describe('interview reminders, to a refused host', () => {
  it.each(REFUSED.flatMap((status) => REMINDERS.map(([which, type, title]) => [status, which, type, title] as const)))(
    'while verification is %s, the %s reminder reaches the organizer without the name and the seeker as before',
    async (status, which, type, title) => {
      const s = await interview(status, 'scheduled', { start: START, end: END });

      await sendInterviewReminder(t.db, { interviewId: s.interviewId, sequence: 1, which }, START);

      const host = await only(s.org.owner.userId, type);
      expect(host.title).toBe(title);
      expect(host.data).toMatchObject({
        interviewId: s.interviewId,
        audience: 'host',
        icsMethod: 'REQUEST',
        start: START.toISOString(),
        end: END.toISOString(),
      });
      expectNoName(host);
      const seeker = await only(s.seeker.userId, type);
      expect(seeker.title).toBe(title);
      expect(seeker.data).toMatchObject({
        interviewId: s.interviewId,
        audience: 'seeker',
        firstName: 'Maya',
        icsMethod: 'REQUEST',
        start: START.toISOString(),
      });
    },
  );

  it.each(REMINDERS)('tells a verified organizer the name with the %s reminder', async (which, type) => {
    const s = await interview('verified', 'scheduled', { start: START, end: END });

    await sendInterviewReminder(t.db, { interviewId: s.interviewId, sequence: 1, which }, START);

    expect((await only(s.org.owner.userId, type)).data).toMatchObject({ audience: 'host', firstName: 'Maya' });
    expect((await only(s.seeker.userId, type)).data).toMatchObject({ audience: 'seeker', firstName: 'Maya' });
  });
});

describe('the cancel when a seeker withdraws, to a refused host', () => {
  it.each(REFUSED)('tells the organizer without the name while verification is %s', async (status) => {
    const s = await interview(status, 'scheduled', { start: START, end: END });

    await withTx(t.db as Db, (tx) => closeOpenItems(tx, { applicationId: s.applicationId, reason: 'withdrawn' }));

    const note = await only(s.org.owner.userId, 'hiring.interview_canceled');
    expect(note.title).toBe('Interview canceled: Deckhand');
    expect(note.data).toMatchObject({
      interviewId: s.interviewId,
      audience: 'host',
      icsMethod: 'CANCEL',
      start: START.toISOString(),
      end: END.toISOString(),
    });
    expectNoName(note);
    expectNameNotRead(s.seeker.userId);
  });

  it('tells a verified organizer the name', async () => {
    const s = await interview('verified', 'scheduled', { start: START, end: END });

    await withTx(t.db as Db, (tx) => closeOpenItems(tx, { applicationId: s.applicationId, reason: 'withdrawn' }));

    const note = await only(s.org.owner.userId, 'hiring.interview_canceled');
    expect(note.data).toMatchObject({ audience: 'host', icsMethod: 'CANCEL', firstName: 'Maya' });
  });

  it.each(REFUSED)('leaves the seeker cancel on a pass unchanged while verification is %s', async (status) => {
    const s = await interview(status, 'scheduled', { start: START, end: END });

    await withTx(t.db as Db, (tx) => closeOpenItems(tx, { applicationId: s.applicationId, reason: 'not_selected' }));

    const note = await only(s.seeker.userId, 'hiring.interview_canceled');
    expect(note.data).toMatchObject({ audience: 'seeker', icsMethod: 'CANCEL', firstName: 'Maya' });
  });
});

// The seeker's answers are refused before anything is sent while the host is refused (issue
// 212), so these notices reach a refused host only if its status changes during the answer. The
// notice layer still keeps the name out.
const ANSWERS = [
  ['hiring.interview_scheduled', true, 'Interview scheduled: Deckhand', 'Interview scheduled: Deckhand'],
  ['hiring.interview_times_requested', false, 'A candidate asked for new interview times', 'Maya asked for new interview times'],
  ['hiring.interview_declined', false, 'A candidate declined the interview', 'Maya declined the interview'],
] as const;

function recipients(s: { org: { owner: { userId: string } }; seeker: { userId: string } }, toSeeker: boolean) {
  const host = { userId: s.org.owner.userId, audience: 'host' as const };
  return toSeeker ? [{ userId: s.seeker.userId, audience: 'seeker' as const }, host] : [host];
}

describe('seeker answer notices, to a refused host', () => {
  it.each(REFUSED.flatMap((status) => ANSWERS.map((answer) => [status, ...answer] as const)))(
    'while verification is %s, %s reaches the host without the name',
    async (status, type, toSeeker, refusedTitle) => {
      const s = await interview(status, 'scheduled', { start: START, end: END });

      await notifyInterview(t.db, s.row, s.seeker.userId, recipients(s, toSeeker), type);

      const host = await only(s.org.owner.userId, type);
      expect(host.title).toBe(refusedTitle);
      expect(host.data).toMatchObject({ interviewId: s.interviewId, audience: 'host', position: 'Deckhand' });
      expectNoName(host);
      if (toSeeker) {
        const seeker = await only(s.seeker.userId, type);
        expect(seeker.data).toMatchObject({ audience: 'seeker', firstName: 'Maya' });
      } else {
        expectNameNotRead(s.seeker.userId);
      }
    },
  );

  it.each(ANSWERS)('%s tells a verified host the name', async (type, toSeeker, _refusedTitle, verifiedTitle) => {
    const s = await interview('verified', 'scheduled', { start: START, end: END });

    await notifyInterview(t.db, s.row, s.seeker.userId, recipients(s, toSeeker), type);

    const host = await only(s.org.owner.userId, type);
    expect(host.title).toBe(verifiedTitle);
    expect(host.data).toMatchObject({ audience: 'host', firstName: 'Maya' });
  });

  it('reads no verification for a notice only the seeker gets', async () => {
    const s = await interview('failed', 'scheduled', { start: START, end: END });
    orgsFake.calls.length = 0;

    await notifyInterview(
      t.db,
      s.row,
      s.seeker.userId,
      [{ userId: s.seeker.userId, audience: 'seeker' }],
      'hiring.interview_invited',
    );

    expect((await only(s.seeker.userId, 'hiring.interview_invited')).data).toMatchObject({ firstName: 'Maya' });
    // Only `placeOf` asks for the org, for its name.
    expect(orgsFake.calls.filter((call) => call.name === 'getOrgSummaries')).toHaveLength(1);
  });
});
