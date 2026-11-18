// The review of PR 178 (issue 186): closed applications, blocks, the wider scam scan,
// held items, the calendar link after a change, the time zone and requested windows.
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews, notifications, offers, pipelineEntries } from '@/db/schema';
import type { InterviewProposal } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import type { HostContext } from '@/server/guards';
import { applicationsFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { mockDbModule, setupRouteDb } from '@tests/helpers/sp4';
import { seedEntry, seedHostOrg, seedOffer, seedSeeker } from '@tests/helpers/sp5';
import { withTx, type Db } from '@/lib/db';
import { runNoteScan } from '../notes';
import { closeOpenItems } from './close';
import { getInterviewIcs } from './ics';
import { loadInterviewNote, releaseInterviewNote } from './notes';
import { cancelInterview, proposeInterview, proposeNewRound } from './propose';
import { listSeekerInterviews } from './reads';
import { declineInterview, pickSlot, requestNewTimes } from './respond';

vi.mock('@/lib/db', async (orig) => mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...(await import('@tests/fakes/sp5/sp4')).applicationsFake,
}));
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
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));

const t = setupRouteDb();
const NOW = new Date('2026-11-03T17:00:00Z');
const HOUR = 60 * 60_000;
const db = () => t.db as Db;

function slot(ms: number): { start: string } {
  return { start: new Date(NOW.getTime() + ms).toISOString() };
}

function firstSlot(view: { slots: { id: string }[] }): string {
  const chosen = view.slots[0];
  if (!chosen) throw new Error('expected a slot');
  return chosen.id;
}

async function scene() {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge');
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status: 'new',
  });
  return { org, seeker, listingId, applicationId, ctx: org.owner.ctx };
}

function propose(ctx: HostContext, applicationId: string, extra: Partial<InterviewProposal> = {}) {
  return proposeInterview(
    db(),
    ctx,
    applicationId,
    { slots: [slot(48 * HOUR)], durationMinutes: 30, format: 'phone', expiryHours: 72, ...extra },
    NOW,
  );
}

function newRound(ctx: HostContext, interviewId: string, extra: { timezone?: string } = {}) {
  return proposeNewRound(
    db(),
    ctx,
    interviewId,
    { slots: [slot(72 * HOUR)], durationMinutes: 30, expiryHours: 72, ...extra },
    NOW,
  );
}

async function interviewRow(id: string) {
  const [row] = await t.db.select().from(interviews).where(eq(interviews.id, id));
  if (!row) throw new Error('expected an interview');
  return row;
}

async function typesFor(userId: string): Promise<string[]> {
  const rows = await t.db.select().from(notifications).where(eq(notifications.userId, userId));
  return rows.map((row) => row.type);
}

function named(name: string) {
  return messagingFake.calls.filter((call) => call.name === name);
}

beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
  safetyFake.reset();
});

describe('a closed application', () => {
  it.each(['withdrawn', 'not_selected', 'hired'] as const)(
    'refuses a new round on an expired interview when the application is %s',
    async (status) => {
      const { ctx, seeker, applicationId } = await scene();
      const view = await propose(ctx, applicationId);
      await t.db.update(interviews).set({ status: 'expired' }).where(eq(interviews.id, view.id));
      await t.db.update(pipelineEntries).set({ status }).where(eq(pipelineEntries.applicationId, applicationId));
      const before = (await typesFor(seeker.userId)).filter((type) => type === 'hiring.interview_invited').length;

      await expect(newRound(ctx, view.id)).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'stale_status', current: status },
      });

      const row = await interviewRow(view.id);
      expect(row.status).toBe('expired');
      expect(row.round).toBe(1);
      const after = (await typesFor(seeker.userId)).filter((type) => type === 'hiring.interview_invited').length;
      expect(after).toBe(before);
    },
  );

  it.each(['withdrawn', 'not_selected', 'hired'] as const)(
    'refuses a slot pick when the application is %s',
    async (status) => {
      const { ctx, seeker, applicationId } = await scene();
      const view = await propose(ctx, applicationId);
      await t.db.update(pipelineEntries).set({ status }).where(eq(pipelineEntries.applicationId, applicationId));

      await expect(
        pickSlot(db(), seeker.userId, view.id, { slotId: firstSlot(view), round: 1 }, NOW),
      ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'application_closed' } });

      const row = await interviewRow(view.id);
      expect(row.status).toBe('invited');
      expect(row.scheduledStart).toBeNull();
      expect(await typesFor(seeker.userId)).not.toContain('hiring.interview_scheduled');
    },
  );

  it('still takes a new round and a pick on an open application', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId);
    await t.db.update(interviews).set({ status: 'expired' }).where(eq(interviews.id, view.id));
    const next = await newRound(ctx, view.id);
    expect(next.status).toBe('invited');
    const picked = await pickSlot(db(), seeker.userId, view.id, { slotId: firstSlot(next), round: 2 }, NOW);
    expect(picked.status).toBe('scheduled');
  });
});

describe('a block between the seeker and the org', () => {
  it('refuses a first invite: no interview, card or notification, and the thread is stamped', async () => {
    const { ctx, org, seeker, listingId, applicationId } = await scene();
    const { threadId } = await withTx(db(), (tx) =>
      messagingFake.ensureThread(tx, { orgId: org.orgId, listingId, seekerUserId: seeker.userId, applicationId }),
    );
    messagingFake.calls.length = 0;
    safetyFake.setBlocked(org.orgId, seeker.userId);

    await expect(propose(ctx, applicationId)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'read_only' },
    });

    const rows = await t.db.select().from(interviews).where(eq(interviews.applicationId, applicationId));
    expect(rows).toHaveLength(0);
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('new');
    expect(entry?.interviewState).toBeNull();
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(seeker.userId)).not.toContain('hiring.interview_invited');
    expect(named('setThreadReadOnly').map((call) => call.args.slice(0, 2))).toEqual([[threadId, 'blocked']]);
  });

  it('refuses a new round: the round stays and the seeker hears nothing', async () => {
    const { ctx, org, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId);
    const before = (await typesFor(seeker.userId)).length;
    safetyFake.setBlocked(org.orgId, seeker.userId);

    await expect(newRound(ctx, view.id)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'read_only' },
    });

    const row = await interviewRow(view.id);
    expect(row.round).toBe(1);
    expect(row.sequence).toBe(0);
    expect(await typesFor(seeker.userId)).toHaveLength(before);
    expect(named('setThreadReadOnly').map((call) => call.args.slice(0, 2))).toEqual([[row.threadId, 'blocked']]);
  });

  it('sends nothing when the block lands while the text is still being scanned', async () => {
    const { ctx, org, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId, { note: 'bring boots' });
    safetyFake.setBlocked(org.orgId, seeker.userId);
    await withTx(db(), (tx) =>
      releaseInterviewNote(tx, view.id, { state: 'clear', checkId: newId(), labels: [] }, NOW),
    );
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(seeker.userId)).not.toContain('hiring.interview_invited');
  });
});

describe('the scam scan covers every host text', () => {
  it.each([
    ['the phone note', { format: 'phone', phoneNote: 'send a __block__ deposit first' }],
    ['the address', { format: 'in_person', address: '12 Dock Rd, __block__ a gift card' }],
    ['the video link', { format: 'video', videoUrl: 'https://meet.example.com/__block__' }],
  ] as const)('holds an invite whose %s is a scam, with no note', async (_label, extra) => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId, extra);
    expect(view.noteState).toBe('pending');
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(seeker.userId)).not.toContain('hiring.interview_invited');

    await runNoteScan(db(), { subjectType: 'interview', subjectId: view.id });

    expect((await interviewRow(view.id)).scanState).toBe('held');
    const listed = await listSeekerInterviews(t.db, seeker.userId, { now: NOW });
    expect(listed.items.map((item) => item.id)).not.toContain(view.id);
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(seeker.userId)).not.toContain('hiring.interview_invited');
  });

  it('scans the note together with the place text', async () => {
    const { ctx, applicationId } = await scene();
    const view = await propose(ctx, applicationId, {
      format: 'in_person',
      address: '12 Dock Rd',
      note: 'bring boots',
    });
    const loaded = await loadInterviewNote(t.db, view.id);
    expect(loaded?.text).toContain('bring boots');
    expect(loaded?.text).toContain('12 Dock Rd');
  });

  it('delivers at once when the host wrote nothing', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId);
    expect(view.noteState).toBe('clear');
    expect(named('postCard')).toHaveLength(1);
    expect(await typesFor(seeker.userId)).toContain('hiring.interview_invited');
  });

  it('refuses a video link longer than 1,000 characters', async () => {
    const { ctx, applicationId } = await scene();
    await expect(
      propose(ctx, applicationId, { format: 'video', videoUrl: `https://meet.example.com/${'a'.repeat(1000)}` }),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'video_url_too_long' } });
  });
});

describe('approving a held note', () => {
  it.each(['canceled', 'expired'] as const)('sends nothing for an interview that is %s', async (status) => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId, { note: 'bring boots' });
    await t.db.update(interviews).set({ status, scanState: 'held' }).where(eq(interviews.id, view.id));

    await withTx(db(), (tx) =>
      releaseInterviewNote(tx, view.id, { state: 'clear', checkId: newId(), labels: [] }, NOW),
    );

    expect((await interviewRow(view.id)).scanState).toBe('clear');
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(seeker.userId)).not.toContain('hiring.interview_invited');
  });

  it('sends nothing for an invite past its expiry that the sweep has not reached', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId, { note: 'bring boots' });
    const row = await interviewRow(view.id);
    const late = new Date((row.expiresAt?.getTime() ?? 0) + 1);

    await withTx(db(), (tx) =>
      releaseInterviewNote(tx, view.id, { state: 'clear', checkId: newId(), labels: [] }, late),
    );

    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(seeker.userId)).not.toContain('hiring.interview_invited');
  });

  it('still delivers an open invite', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId, { note: 'bring boots' });
    await withTx(db(), (tx) =>
      releaseInterviewNote(tx, view.id, { state: 'clear', checkId: newId(), labels: [] }, NOW),
    );
    expect(named('postCard')).toHaveLength(1);
    expect(await typesFor(seeker.userId)).toContain('hiring.interview_invited');
  });
});

describe('canceling an item the seeker never saw', () => {
  it('keeps the host cancel event from the seeker', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId, { note: 'please __block__ this' });
    await cancelInterview(db(), ctx, view.id, undefined, NOW);
    expect(named('postEvent').map((call) => call.args[1])).toEqual([
      { code: 'interview_canceled', visibleTo: 'host' },
    ]);
    expect(await typesFor(seeker.userId)).not.toContain('hiring.interview_canceled');
  });

  it('keeps the Pass cancel events and the notification from the seeker', async () => {
    const { ctx, org, seeker, listingId, applicationId } = await scene();
    const view = await propose(ctx, applicationId, { note: 'please __block__ this' });
    const row = await interviewRow(view.id);
    const offerId = await seedOffer(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId: row.threadId,
      createdBy: org.owner.userId,
    });
    await t.db.update(offers).set({ scanState: 'held' }).where(eq(offers.id, offerId));
    messagingFake.calls.length = 0;

    await withTx(db(), (tx) => closeOpenItems(tx, { applicationId, reason: 'not_selected' }));

    expect((await interviewRow(view.id)).status).toBe('canceled');
    expect(named('postEvent').map((call) => call.args[1])).toEqual([
      { code: 'interview_canceled', visibleTo: 'host' },
      { code: 'offer_canceled', visibleTo: 'host' },
    ]);
    expect(await typesFor(seeker.userId)).not.toContain('hiring.interview_canceled');
  });

  it('still shows the cancel of a delivered interview to both sides', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId);
    messagingFake.calls.length = 0;
    await withTx(db(), (tx) => closeOpenItems(tx, { applicationId, reason: 'not_selected' }));
    expect(named('postEvent').map((call) => call.args[1])).toEqual([
      { code: 'interview_canceled', visibleTo: 'all' },
    ]);
    expect(await typesFor(seeker.userId)).toContain('hiring.interview_canceled');
    expect(view.id).toBeTruthy();
  });
});

describe('the calendar file after a change', () => {
  async function scheduled() {
    const s = await scene();
    const view = await propose(s.ctx, s.applicationId);
    await pickSlot(db(), s.seeker.userId, view.id, { slotId: firstSlot(view), round: 1 }, NOW);
    const start = new Date(NOW.getTime() + 48 * HOUR);
    const stamp = start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return { ...s, view, stamp };
  }

  it('is a canceled event for the seeker who declined', async () => {
    const { seeker, view, stamp } = await scheduled();
    await declineInterview(db(), seeker.userId, view.id, { alsoWithdraw: false }, NOW);
    const ics = await getInterviewIcs(t.db, { kind: 'seeker', userId: seeker.userId }, view.id);
    expect(ics.method).toBe('CANCEL');
    expect(ics.content).toContain(`DTSTART:${stamp}`);
    expect(ics.content).toContain('SEQUENCE:2');
    expect(ics.content).toContain('STATUS:CANCELLED');
  });

  it('is a canceled event for the seeker who asked for new times', async () => {
    const { seeker, view, stamp } = await scheduled();
    await requestNewTimes(
      db(),
      seeker.userId,
      view.id,
      { windows: [{ start: slot(60 * HOUR).start, end: slot(62 * HOUR).start }] },
      NOW,
    );
    const ics = await getInterviewIcs(t.db, { kind: 'seeker', userId: seeker.userId }, view.id);
    expect(ics.method).toBe('CANCEL');
    expect(ics.content).toContain(`DTSTART:${stamp}`);
  });

  it('is a canceled event of the old time for the host who proposed a new round, then the new event', async () => {
    const { ctx, seeker, view, stamp } = await scheduled();
    const next = await newRound(ctx, view.id);
    const canceled = await getInterviewIcs(t.db, { kind: 'host', ctx }, view.id);
    expect(canceled.method).toBe('CANCEL');
    expect(canceled.content).toContain(`DTSTART:${stamp}`);
    expect(canceled.content).toContain('SEQUENCE:2');

    await pickSlot(db(), seeker.userId, view.id, { slotId: firstSlot(next), round: 2 }, NOW);
    const updated = await getInterviewIcs(t.db, { kind: 'host', ctx }, view.id);
    expect(updated.method).toBe('REQUEST');
    expect(updated.content).not.toContain(`DTSTART:${stamp}`);
    expect(updated.content).toContain('SEQUENCE:3');
  });

  it('is not found for an interview that never had a time', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId);
    await declineInterview(db(), seeker.userId, view.id, { alsoWithdraw: false }, NOW);
    await expect(getInterviewIcs(t.db, { kind: 'seeker', userId: seeker.userId }, view.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('the interview time zone', () => {
  it('refuses a zone that is not an IANA zone, on a first invite and on a new round', async () => {
    const { ctx, applicationId } = await scene();
    await expect(propose(ctx, applicationId, { timezone: 'Mars/Olympus' })).rejects.toMatchObject({
      code: 'bad_request',
      details: { reason: 'invalid_timezone' },
    });
    const view = await propose(ctx, applicationId);
    await expect(newRound(ctx, view.id, { timezone: 'Etc/Unknown' })).rejects.toMatchObject({
      code: 'bad_request',
      details: { reason: 'invalid_timezone' },
    });
    expect((await interviewRow(view.id)).round).toBe(1);
  });

  it('stores a valid zone in its canonical spelling and defaults to the listing zone', async () => {
    const { ctx, applicationId } = await scene();
    const view = await propose(ctx, applicationId, { timezone: 'america/new_york' });
    expect(view.timezone).toBe('America/New_York');
    const next = await newRound(ctx, view.id, { timezone: 'America/Chicago' });
    expect(next.timezone).toBe('America/Chicago');

    const other = await scene();
    const plain = await propose(other.ctx, other.applicationId);
    expect(plain.timezone).toBe('America/Denver');
  });
});

describe('requestNewTimes', () => {
  it('refuses a window that has already ended', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId);
    await expect(
      requestNewTimes(
        db(),
        seeker.userId,
        view.id,
        { windows: [{ start: slot(-3 * HOUR).start, end: slot(-1 * HOUR).start }] },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'window_passed' } });
    expect((await interviewRow(view.id)).status).toBe('invited');
  });

  it('does not reopen an invite past its expiry', async () => {
    const { ctx, seeker, applicationId } = await scene();
    const view = await propose(ctx, applicationId);
    const row = await interviewRow(view.id);
    const late = new Date((row.expiresAt?.getTime() ?? 0) + 60_000);
    await expect(
      requestNewTimes(
        db(),
        seeker.userId,
        view.id,
        {
          windows: [
            { start: new Date(late.getTime() + HOUR).toISOString(), end: new Date(late.getTime() + 3 * HOUR).toISOString() },
          ],
        },
        late,
      ),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'expired' } });
    const after = await interviewRow(view.id);
    expect(after.status).toBe('invited');
    expect(after.requestedWindows).toBeNull();
  });
});
