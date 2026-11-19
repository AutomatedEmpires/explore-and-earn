// The verified-host gate on host interviews (legal review 7.1, issue 198). The interview list
// names applicants, and proposals and changes act on them, so a host the applicant gate refuses
// (never verified, running, needs_review, needs_info or failed) gets the applicant list's 409
// and reads or writes nothing, including for interviews it set up while it was verified.
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews, notifications, pipelineEntries } from '@/db/schema';
import type { Db } from '@/lib/db';
import type { InterviewProposal } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import type { VerificationStatus } from '@/modules/verification';
import type { HostContext } from '@/server/guards';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { asHost, call, mockDbModule, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
// After the test helpers: loading orgs loads @/lib/db, whose mock needs them.
import * as orgs from '@/modules/orgs';
import { GET as LIST } from '@/app/api/v1/host/interviews/route';
import { POST as CANCEL } from '@/app/api/v1/host/interviews/[id]/cancel/route';
import { POST as OUTCOME } from '@/app/api/v1/host/interviews/[id]/outcome/route';
import { POST as PROPOSE_ROUND } from '@/app/api/v1/host/interviews/[id]/propose/route';
import { POST as PROPOSE } from '@/app/api/v1/host/applicants/[applicationId]/interviews/route';
import { listApplicants } from '../pipeline/applicants';
import { cancelInterview, proposeInterview, proposeNewRound, recordInterviewOutcome } from './propose';
import { listHostInterviews } from './reads';

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

const t = setupRouteDb();
const NOW = new Date('2026-11-03T17:00:00Z');
const HOUR = 60 * 60_000;
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;

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

function slot(ms: number): { start: string } {
  return { start: new Date(NOW.getTime() + ms).toISOString() };
}

const proposal: InterviewProposal = {
  slots: [slot(2 * HOUR), slot(30 * HOUR)],
  durationMinutes: 30,
  format: 'phone',
  expiryHours: 72,
};

async function scene() {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status: 'new',
  });
  return { org, seeker, listingId, applicationId, ctx: org.owner.ctx };
}

/** A scene whose interview the host proposed while it was verified. */
async function withInterview() {
  const s = await scene();
  const view = await proposeInterview(t.db as Db, s.ctx, s.applicationId, proposal, NOW);
  return { ...s, interviewId: view.id };
}

/** The applicant list's refusal for this host, which every interview path must match. */
async function applicantListRefusal(ctx: HostContext): Promise<unknown> {
  try {
    await listApplicants(t.db, ctx, { sort: 'newest', limit: 25 });
  } catch (err) {
    return err;
  }
  throw new Error('expected the applicant list to refuse this host');
}

function refusalOf(err: unknown, status: string) {
  const e = err as { status: number; code: string; message: string; details: unknown };
  expect(e).toMatchObject({ status: 409, code: 'conflict', details: { reason: `verification_${status}` } });
  return { status: e.status, code: e.code, message: e.message, details: e.details };
}

const window = { from: NOW.toISOString(), to: new Date(NOW.getTime() + 31 * HOUR).toISOString() };

beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listHostInterviews', () => {
  it('lists interviews, with the applicant cards their names come from, for a verified host', async () => {
    const s = await withInterview();
    const listed = await listHostInterviews(t.db, s.ctx, window, NOW);
    expect(listed.items.map((item) => item.interviewId)).toEqual([s.interviewId]);
    expect(listed.items[0]).toMatchObject({ applicationId: s.applicationId, listingTitle: 'Deckhand' });
    expect(applicationsFake.calls.some((c) => c.name === 'getHostCards')).toBe(true);
  });

  it.each(REFUSED)(
    'refuses a host whose verification is %s with the applicant list 409, and reads no applicant',
    async (status) => {
      const s = await withInterview();
      verification(status, s.org.orgId);
      const expected = refusalOf(await applicantListRefusal(s.ctx), status);
      applicationsFake.calls.length = 0;

      await expect(listHostInterviews(t.db, s.ctx, window, NOW)).rejects.toMatchObject(expected);
      expect(applicationsFake.calls.some((c) => c.name === 'getHostCards')).toBe(false);
    },
  );

  it('GET /api/v1/host/interviews answers 409 for a failed host and the list for a verified one', async () => {
    const s = await withInterview();
    asHost(s.ctx);
    const ok = await call(LIST, request('GET', '/api/v1/host/interviews', { query: window }));
    expect(ok.status).toBe(200);
    expect((ok.body as { items: { interviewId: string }[] }).items.map((i) => i.interviewId)).toEqual([
      s.interviewId,
    ]);

    verification('failed', s.org.orgId);
    const expected = refusalOf(await applicantListRefusal(s.ctx), 'failed');
    const refused = await call(LIST, request('GET', '/api/v1/host/interviews', { query: window }));
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      error: { code: 'conflict', message: expected.message, details: { reason: 'verification_failed' } },
    });
    expect(JSON.stringify(refused.body)).not.toContain(s.applicationId);
  });
});

describe('host interview writes', () => {
  it.each(REFUSED)('refuses a proposal while verification is %s and writes nothing', async (status) => {
    const s = await scene();
    verification(status, s.org.orgId);
    const expected = refusalOf(await applicantListRefusal(s.ctx), status);

    await expect(proposeInterview(t.db as Db, s.ctx, s.applicationId, proposal, NOW)).rejects.toMatchObject(
      expected,
    );
    expect(await t.db.select().from(interviews).where(eq(interviews.applicationId, s.applicationId))).toEqual([]);
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, s.applicationId));
    expect(entry?.status).toBe('new');
    expect(messagingFake.calls.some((c) => c.name === 'ensureThread')).toBe(false);
  });

  it.each(REFUSED)('refuses a new round, a cancel and an outcome while verification is %s', async (status) => {
    const s = await withInterview();
    // Scheduled and already over, so each write would otherwise go through.
    await t.db
      .update(interviews)
      .set({
        status: 'scheduled',
        scheduledStart: new Date(NOW.getTime() - 2 * HOUR),
        scheduledEnd: new Date(NOW.getTime() - HOUR),
      })
      .where(eq(interviews.id, s.interviewId));
    const [before] = await t.db.select().from(interviews).where(eq(interviews.id, s.interviewId));
    const noticesBefore = await t.db.select().from(notifications).where(eq(notifications.userId, s.seeker.userId));
    verification(status, s.org.orgId);
    const expected = refusalOf(await applicantListRefusal(s.ctx), status);

    await expect(
      proposeNewRound(
        t.db as Db,
        s.ctx,
        s.interviewId,
        { slots: [slot(72 * HOUR)], durationMinutes: 30, expiryHours: 72 },
        NOW,
      ),
    ).rejects.toMatchObject(expected);
    await expect(cancelInterview(t.db as Db, s.ctx, s.interviewId, {}, NOW)).rejects.toMatchObject(expected);
    await expect(recordInterviewOutcome(t.db as Db, s.ctx, s.interviewId, 'completed', NOW)).rejects.toMatchObject(
      expected,
    );

    const [after] = await t.db.select().from(interviews).where(eq(interviews.id, s.interviewId));
    expect(after).toEqual(before);
    const noticesAfter = await t.db.select().from(notifications).where(eq(notifications.userId, s.seeker.userId));
    expect(noticesAfter).toHaveLength(noticesBefore.length);
  });

  it('lets a verified host propose, move, record and cancel', async () => {
    const s = await withInterview();
    const next = await proposeNewRound(
      t.db as Db,
      s.ctx,
      s.interviewId,
      { slots: [slot(72 * HOUR)], durationMinutes: 30, expiryHours: 72 },
      NOW,
    );
    expect(next.round).toBe(2);
    expect((await cancelInterview(t.db as Db, s.ctx, s.interviewId, {}, NOW)).status).toBe('canceled');

    const done = await withInterview();
    await t.db
      .update(interviews)
      .set({
        status: 'scheduled',
        scheduledStart: new Date(NOW.getTime() - 2 * HOUR),
        scheduledEnd: new Date(NOW.getTime() - HOUR),
      })
      .where(eq(interviews.id, done.interviewId));
    expect((await recordInterviewOutcome(t.db as Db, done.ctx, done.interviewId, 'completed', NOW)).status).toBe(
      'completed',
    );
  });

  it('answers the host interview routes with the 409 for a failed host', async () => {
    const s = await withInterview();
    const fresh = await scene();
    verification('failed', s.org.orgId, fresh.org.orgId);
    // The routes check times against the real clock, so these slots are valid ones from now.
    const live = (ms: number) => ({ start: new Date(Date.now() + ms).toISOString() });
    const body = { slots: [live(72 * HOUR)], durationMinutes: 30, expiryHours: 72 };
    const refused = { error: { code: 'conflict', details: { reason: 'verification_failed' } } };

    asHost(s.ctx);
    const params = { id: s.interviewId };
    const round = await call(PROPOSE_ROUND, request('POST', `/api/v1/host/interviews/${s.interviewId}/propose`, { body }), params);
    const cancel = await call(CANCEL, request('POST', `/api/v1/host/interviews/${s.interviewId}/cancel`, { body: {} }), params);
    const outcome = await call(
      OUTCOME,
      request('POST', `/api/v1/host/interviews/${s.interviewId}/outcome`, { body: { outcome: 'completed' } }),
      params,
    );
    asHost(fresh.ctx);
    const proposed = await call(
      PROPOSE,
      request('POST', `/api/v1/host/applicants/${fresh.applicationId}/interviews`, {
        body: { ...proposal, slots: [live(2 * HOUR), live(30 * HOUR)] },
      }),
      { applicationId: fresh.applicationId },
    );
    for (const res of [round, cancel, outcome, proposed]) {
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject(refused);
    }
  });
});
