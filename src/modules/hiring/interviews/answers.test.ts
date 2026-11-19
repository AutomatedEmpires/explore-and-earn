// Seeker answers to a host the applicant gate refuses (issue 212, the follow-up to 198). Picking a
// slot, asking for new times and declining each tell the host the seeker's first name. So while
// the host is refused (never verified, running, needs_review, needs_info or failed), each answer
// gets the invite's neutral 409 `not_taking_answers`, and nothing is written or sent: no
// interview change, no pipeline event, no thread event, no reminder, no notification, no audit
// row and no name read. The interview stays as it was, for when the host is verified again.
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, interviews, notifications, outbox, pipelineEntries, pipelineEvents } from '@/db/schema';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { VerificationStatus } from '@/modules/verification';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { asSeeker, call, mockDbModule, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
// After the test helpers: loading orgs loads @/lib/db, whose mock needs them.
import * as orgs from '@/modules/orgs';
import { POST as DECLINE } from '@/app/api/v1/me/interviews/[id]/decline/route';
import { POST as PICK } from '@/app/api/v1/me/interviews/[id]/pick/route';
import { POST as REQUEST_TIMES } from '@/app/api/v1/me/interviews/[id]/request-times/route';
import { INVITE_NOT_TAKING_ANSWERS } from '../invites/respond';
import { proposeInterview } from './propose';
import { declineInterview, pickSlot, requestNewTimes } from './respond';

const names = vi.hoisted(() => ({ getCommunityIdentities: vi.fn() }));

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
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  getCommunityIdentities: names.getCommunityIdentities,
}));

const t = setupRouteDb();
const NOW = new Date('2026-11-03T17:00:00Z');
const HOUR = 60 * 60_000;
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;

/** The invite's answer to a refused host: neutral, and the same for every refused status. */
const NEUTRAL = {
  status: 409,
  code: 'conflict',
  message: INVITE_NOT_TAKING_ANSWERS,
  details: { reason: 'not_taking_answers' },
};

/** SP2 reports this verification status for these orgs (the fake reports `verified` otherwise). */
function verification(status: VerificationStatus, ...orgIds: string[]): void {
  vi.spyOn(orgs, 'getOrgSummaries').mockImplementation(async (db, ids) => {
    const out = await orgsFake.getOrgSummaries(db, ids);
    for (const orgId of orgIds) {
      const row = out.get(orgId);
      if (row) out.set(orgId, { ...row, verificationStatus: status });
    }
    return out;
  });
}

/** An interview the host proposed while verified, `at` from `now`, for a seeker named Maya. */
async function invited(now = NOW) {
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
  const view = await proposeInterview(
    t.db as Db,
    org.owner.ctx,
    applicationId,
    {
      slots: [{ start: new Date(now.getTime() + 48 * HOUR).toISOString() }],
      durationMinutes: 30,
      format: 'phone',
      expiryHours: 72,
    },
    now,
  );
  const slotId = view.slots[0]?.id;
  if (!slotId) throw new Error('expected a slot');
  return { org, seeker, listingId, applicationId, interviewId: view.id, slotId };
}

/** The same interview, scheduled by the seeker while the host was verified. */
async function scheduled(now = NOW) {
  const s = await invited(now);
  await pickSlot(t.db as Db, s.seeker.userId, s.interviewId, { slotId: s.slotId, round: 1 }, now);
  return s;
}

/** Everything an answer could write or send, to compare before and after a refusal. */
async function snapshot(s: { org: { orgId: string }; applicationId: string; interviewId: string }) {
  const [interview] = await t.db.select().from(interviews).where(eq(interviews.id, s.interviewId));
  const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, s.applicationId));
  return {
    interview,
    entry,
    events: await t.db.select().from(pipelineEvents).where(eq(pipelineEvents.applicationId, s.applicationId)),
    notifications: await t.db.select().from(notifications),
    reminders: await t.db.select().from(outbox).where(eq(outbox.topic, 'hiring.interview_reminder')),
    audit: await t.db.select().from(auditEvents).where(eq(auditEvents.orgId, s.org.orgId)),
  };
}

/** Clears the call logs the setup wrote, so a test sees only what the answer did. */
function clearCalls(): void {
  applicationsFake.calls.length = 0;
  messagingFake.calls.length = 0;
  names.getCommunityIdentities.mockClear();
}

function expectNothingSent(): void {
  expect(messagingFake.calls.map((c) => c.name)).toEqual([]);
  expect(applicationsFake.calls.map((c) => c.name)).toEqual([]);
  expect(names.getCommunityIdentities).not.toHaveBeenCalled();
}

function expectNeutral(err: unknown): void {
  expect(err).toMatchObject(NEUTRAL);
  const e = err as { message: string; details: unknown };
  expect(JSON.stringify({ message: e.message, details: e.details })).not.toMatch(
    /verif|unverified|running|needs_review|needs_info|failed/i,
  );
}

async function refusal(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (err) {
    return err;
  }
  throw new Error('expected the answer to be refused');
}

const windows = [
  {
    start: new Date(NOW.getTime() + 96 * HOUR).toISOString(),
    end: new Date(NOW.getTime() + 98 * HOUR).toISOString(),
  },
];

beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
  names.getCommunityIdentities.mockReset();
  names.getCommunityIdentities.mockImplementation(async (_db: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { displayName: 'Maya Rodriguez', firstName: 'Maya', lastInitial: 'R', avatarMediaId: null }])),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seeker interview answers to a refused host', () => {
  it.each(REFUSED)('refuses picking a slot while verification is %s, and writes and sends nothing', async (status) => {
    const s = await invited();
    const before = await snapshot(s);
    verification(status, s.org.orgId);
    clearCalls();

    expectNeutral(
      await refusal(() => pickSlot(t.db as Db, s.seeker.userId, s.interviewId, { slotId: s.slotId, round: 1 }, NOW)),
    );
    expect(await snapshot(s)).toEqual(before);
    expect(before.interview?.status).toBe('invited');
    expectNothingSent();
  });

  it.each(REFUSED)('refuses asking for new times while verification is %s, and writes and sends nothing', async (status) => {
    const s = await scheduled();
    const before = await snapshot(s);
    verification(status, s.org.orgId);
    clearCalls();

    expectNeutral(await refusal(() => requestNewTimes(t.db as Db, s.seeker.userId, s.interviewId, { windows }, NOW)));
    expect(await snapshot(s)).toEqual(before);
    expect(before.interview?.status).toBe('scheduled');
    expectNothingSent();
  });

  it.each(REFUSED)('refuses declining while verification is %s, with or without withdrawing', async (status) => {
    const s = await scheduled();
    const before = await snapshot(s);
    verification(status, s.org.orgId);
    clearCalls();

    for (const alsoWithdraw of [false, true]) {
      expectNeutral(
        await refusal(() => declineInterview(t.db as Db, s.seeker.userId, s.interviewId, { alsoWithdraw }, NOW)),
      );
    }
    expect(await snapshot(s)).toEqual(before);
    expectNothingSent();
  });

  it('still answers not found to another seeker, so the refusal names no interview', async () => {
    const s = await invited();
    const other = await seedSeeker(t.db);
    verification('failed', s.org.orgId);

    await expect(
      pickSlot(t.db as Db, other.userId, s.interviewId, { slotId: s.slotId, round: 1 }, NOW),
    ).rejects.toMatchObject({ status: 404, details: { reason: 'not_found' } });
    await expect(
      declineInterview(t.db as Db, other.userId, s.interviewId, { alsoWithdraw: false }, NOW),
    ).rejects.toMatchObject({ status: 404, details: { reason: 'not_found' } });
  });

  it('takes each answer from a verified host, which is told the first name', async () => {
    const picked = await invited();
    clearCalls();
    expect(
      (await pickSlot(t.db as Db, picked.seeker.userId, picked.interviewId, { slotId: picked.slotId, round: 1 }, NOW))
        .status,
    ).toBe('scheduled');
    const asked = await scheduled();
    expect(
      (await requestNewTimes(t.db as Db, asked.seeker.userId, asked.interviewId, { windows }, NOW)).status,
    ).toBe('reschedule_requested');
    const declined = await scheduled();
    const out = await declineInterview(t.db as Db, declined.seeker.userId, declined.interviewId, { alsoWithdraw: false }, NOW);
    expect(out.interview.status).toBe('declined');

    for (const [s, type] of [
      [picked, 'hiring.interview_scheduled'],
      [asked, 'hiring.interview_times_requested'],
      [declined, 'hiring.interview_declined'],
    ] as const) {
      const told = await t.db.select().from(notifications).where(eq(notifications.userId, s.org.owner.userId));
      expect(told.find((n) => n.type === type)?.data).toMatchObject({ firstName: 'Maya', audience: 'host' });
    }
  });

  it('takes the answer once the host is verified again, from the same interview', async () => {
    const s = await invited();
    verification('needs_info', s.org.orgId);
    await expect(
      pickSlot(t.db as Db, s.seeker.userId, s.interviewId, { slotId: s.slotId, round: 1 }, NOW),
    ).rejects.toMatchObject(NEUTRAL);

    vi.restoreAllMocks();
    const item = await pickSlot(t.db as Db, s.seeker.userId, s.interviewId, { slotId: s.slotId, round: 1 }, NOW);
    expect(item.status).toBe('scheduled');
  });

  it('answers the seeker interview routes with the neutral 409 for a failed host', async () => {
    // The routes read the real clock, so this interview's time is ahead of it.
    const now = new Date();
    const picking = await invited(now);
    const asking = await scheduled(now);
    const declining = await scheduled(now);
    verification('failed', picking.org.orgId, asking.org.orgId, declining.org.orgId);
    const live = {
      start: new Date(now.getTime() + 96 * HOUR).toISOString(),
      end: new Date(now.getTime() + 98 * HOUR).toISOString(),
    };

    asSeeker(picking.seeker.user);
    const pick = await call(
      PICK,
      request('POST', `/api/v1/me/interviews/${picking.interviewId}/pick`, {
        body: { slotId: picking.slotId, round: 1 },
      }),
      { id: picking.interviewId },
    );
    asSeeker(asking.seeker.user);
    const ask = await call(
      REQUEST_TIMES,
      request('POST', `/api/v1/me/interviews/${asking.interviewId}/request-times`, { body: { windows: [live] } }),
      { id: asking.interviewId },
    );
    asSeeker(declining.seeker.user);
    const decline = await call(
      DECLINE,
      request('POST', `/api/v1/me/interviews/${declining.interviewId}/decline`, { body: { alsoWithdraw: true } }),
      { id: declining.interviewId },
    );

    for (const res of [pick, ask, decline]) {
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: { code: 'conflict', message: INVITE_NOT_TAKING_ANSWERS, details: { reason: 'not_taking_answers' } },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/verif|failed/i);
    }
    const rows = await t.db.select().from(interviews).where(eq(interviews.id, declining.interviewId));
    expect(rows[0]?.status).toBe('scheduled');
  });
});
