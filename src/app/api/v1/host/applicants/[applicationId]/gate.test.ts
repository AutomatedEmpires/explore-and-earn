// The verified-host gate on Mark hired, Shortlist, Pass and Undo (legal review 7.1, issue 234;
// review pass 3 on issue 198). Each acts on an applicant, and Mark hired sends the seeker a
// platform notice, so a host the applicant gate refuses (never verified, running, needs_review,
// needs_info or failed) gets the applicant list's 409 from all four routes and writes nothing,
// including for applications that arrived while it was verified.
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, notifications } from '@/db/schema';
import { newId } from '@/lib/ids';
import { pendingPasses, pipelineEntries } from '@/modules/hiring/schema';
import type { VerificationStatus } from '@/modules/verification';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
// After the test helpers: loading orgs loads @/lib/db, whose mock needs them.
import * as orgs from '@/modules/orgs';
import { requireApplicantReads } from '@/modules/hiring/pipeline/gate';
import { POST as HIRE } from '@/app/api/v1/host/applicants/[applicationId]/hire/route';
import { POST as PASS } from '@/app/api/v1/host/applicants/[applicationId]/pass/route';
import { POST as UNDO } from '@/app/api/v1/host/applicants/[applicationId]/pass/undo/route';
import { POST as SHORTLIST } from '@/app/api/v1/host/applicants/[applicationId]/shortlist/route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
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
vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
}));

const t = setupRouteDb();
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;

/** SP2 reports this verification status for this org (the fake reports `verified` otherwise). */
function verification(status: VerificationStatus, orgId: string): void {
  vi.spyOn(orgs, 'getOrgSummaries').mockImplementation(async (db, ids) => {
    const out = await orgsFake.getOrgSummaries(db, ids);
    const row = out.get(orgId);
    if (row) out.set(orgId, { ...row, verificationStatus: status });
    return out;
  });
}

async function scene(status: 'new' | 'shortlisted' = 'new') {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  const applicationId = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId, status });
  asHost(org.owner.ctx);
  return { org, seeker, listingId, applicationId };
}

/** The applicant list's refusal for this host, which each route must match. */
async function listRefusal(orgId: string, status: string) {
  const err = await requireApplicantReads(t.db, orgId).then(
    () => null,
    (e: unknown) => e as { status: number; code: string; message: string },
  );
  if (!err) throw new Error('expected the applicant gate to refuse this host');
  return { error: { code: 'conflict', message: err.message, details: { reason: `verification_${status}` } } };
}

const hire = (id: string) =>
  call(HIRE, request('POST', `/api/v1/host/applicants/${id}/hire`), { applicationId: id });
const shortlist = (id: string, on = true) =>
  call(SHORTLIST, request('POST', `/api/v1/host/applicants/${id}/shortlist`, { body: { on } }), {
    applicationId: id,
  });
const pass = (id: string) =>
  call(PASS, request('POST', `/api/v1/host/applicants/${id}/pass`), { applicationId: id });
const undo = (id: string) =>
  call(UNDO, request('POST', `/api/v1/host/applicants/${id}/pass/undo`), { applicationId: id });

async function entryOf(applicationId: string) {
  const [row] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
  return row;
}

async function pendingOf(applicationId: string) {
  return t.db.select().from(pendingPasses).where(eq(pendingPasses.applicationId, applicationId));
}

async function auditsOf(applicationId: string): Promise<string[]> {
  const rows = await t.db.select().from(auditEvents).where(eq(auditEvents.subjectId, applicationId));
  return rows.map((row) => row.action);
}

async function noticesOf(userId: string): Promise<string[]> {
  const rows = await t.db.select().from(notifications).where(eq(notifications.userId, userId));
  return rows.map((row) => row.type);
}

/** No status move reached SP4 and nothing reached the thread. */
function expectNothingSent(): void {
  expect(applicationsFake.calls.some((c) => c.name === 'setStatus')).toBe(false);
  expect(messagingFake.calls).toEqual([]);
}

beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/v1/host/applicants/{applicationId}/hire', () => {
  it.each(REFUSED)('refuses a host whose verification is %s: no hire, no notice to the seeker', async (status) => {
    const s = await scene();
    verification(status, s.org.orgId);
    const expected = await listRefusal(s.org.orgId, status);
    applicationsFake.calls.length = 0;
    messagingFake.calls.length = 0;

    const res = await hire(s.applicationId);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject(expected);
    expect((await entryOf(s.applicationId))?.status).toBe('new');
    expect(await noticesOf(s.seeker.userId)).toEqual([]);
    expect(await auditsOf(s.applicationId)).not.toContain('hiring.marked_hired');
    expectNothingSent();
  });

  it('marks the applicant hired and tells the seeker for a verified host', async () => {
    const s = await scene();
    const res = await hire(s.applicationId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'hired' });
    expect((await entryOf(s.applicationId))?.status).toBe('hired');
    expect(await noticesOf(s.seeker.userId)).toEqual(['hiring.marked_hired']);
  });
});

describe('POST /api/v1/host/applicants/{applicationId}/shortlist', () => {
  it.each(REFUSED)('refuses a host whose verification is %s, on and off', async (status) => {
    const fresh = await scene();
    const listed = await scene('shortlisted');
    verification(status, fresh.org.orgId);
    const expectedOn = await listRefusal(fresh.org.orgId, status);
    applicationsFake.calls.length = 0;
    messagingFake.calls.length = 0;

    asHost(fresh.org.owner.ctx);
    const on = await shortlist(fresh.applicationId, true);
    expect(on.status).toBe(409);
    expect(on.body).toMatchObject(expectedOn);
    expect((await entryOf(fresh.applicationId))?.status).toBe('new');

    verification(status, listed.org.orgId);
    asHost(listed.org.owner.ctx);
    const off = await shortlist(listed.applicationId, false);
    expect(off.status).toBe(409);
    expect(off.body).toMatchObject({ error: { details: { reason: `verification_${status}` } } });
    expect((await entryOf(listed.applicationId))?.status).toBe('shortlisted');
    expectNothingSent();
  });

  it('shortlists for a verified host', async () => {
    const s = await scene();
    const res = await shortlist(s.applicationId, true);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'shortlisted' });
    expect((await entryOf(s.applicationId))?.status).toBe('shortlisted');
  });
});

describe('POST /api/v1/host/applicants/{applicationId}/pass', () => {
  it.each(REFUSED)('refuses a host whose verification is %s and schedules no pass', async (status) => {
    const s = await scene();
    verification(status, s.org.orgId);
    const expected = await listRefusal(s.org.orgId, status);
    applicationsFake.calls.length = 0;
    messagingFake.calls.length = 0;

    const res = await pass(s.applicationId);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject(expected);
    expect(await pendingOf(s.applicationId)).toEqual([]);
    expect(await auditsOf(s.applicationId)).not.toContain('hiring.pass_scheduled');
    expect((await entryOf(s.applicationId))?.status).toBe('new');
    expectNothingSent();
  });

  it('schedules the pass for a verified host', async () => {
    const s = await scene();
    const res = await pass(s.applicationId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ undoUntil: expect.any(String) });
    expect(await pendingOf(s.applicationId)).toHaveLength(1);
  });
});

describe('POST /api/v1/host/applicants/{applicationId}/pass/undo', () => {
  it.each(REFUSED)('refuses a host whose verification is %s, for a pass made while verified', async (status) => {
    const s = await scene();
    expect((await pass(s.applicationId)).status).toBe(200);
    verification(status, s.org.orgId);
    const expected = await listRefusal(s.org.orgId, status);

    const res = await undo(s.applicationId);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject(expected);
    expect(await pendingOf(s.applicationId)).toHaveLength(1);
    expect(await auditsOf(s.applicationId)).not.toContain('hiring.pass_undone');
  });

  it('undoes the pass for a verified host', async () => {
    const s = await scene();
    expect((await pass(s.applicationId)).status).toBe(200);
    const res = await undo(s.applicationId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'new' });
    expect(await pendingOf(s.applicationId)).toEqual([]);
  });
});
