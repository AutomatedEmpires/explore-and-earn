// The verified-host gate on offer writes (legal review 7.1, issue 198). Sending or canceling an
// offer acts on an applicant, so a host the applicant gate refuses (never verified, running,
// needs_review, needs_info or failed) gets the applicant list's 409 and writes nothing,
// including for an offer it sent while it was verified.
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications, offers, pipelineEntries } from '@/db/schema';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { VerificationStatus } from '@/modules/verification';
import type { HostContext } from '@/server/guards';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
// After the test helpers: loading orgs loads @/lib/db, whose mock needs them.
import * as orgs from '@/modules/orgs';
import { POST as CANCEL } from '@/app/api/v1/host/offers/[id]/cancel/route';
import { POST as SEND } from '@/app/api/v1/host/applicants/[applicationId]/offers/route';
import { listApplicants } from '../pipeline/applicants';
import { cancelOffer, sendOffer } from './offers';

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

const t = setupRouteDb();
const NOW = new Date('2026-11-03T17:00:00Z');
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;
const pay = { amountCents: 2200, unit: 'hour' as const };

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

async function interviewing() {
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
  return { org, seeker, listingId, applicationId, ctx: org.owner.ctx };
}

/** The applicant list's refusal for this host, which every offer write must match. */
async function applicantListRefusal(ctx: HostContext, status: string) {
  let err: unknown = null;
  try {
    await listApplicants(t.db, ctx, { sort: 'newest', limit: 25 });
  } catch (e) {
    err = e;
  }
  const e = err as { status: number; code: string; message: string; details: unknown };
  expect(e).toMatchObject({ status: 409, code: 'conflict', details: { reason: `verification_${status}` } });
  return { status: e.status, code: e.code, message: e.message, details: e.details };
}

async function entryOf(applicationId: string) {
  const [row] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
  return row;
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

describe('offer writes and the verified-host gate', () => {
  it.each(REFUSED)('refuses sending an offer while verification is %s and writes nothing', async (status) => {
    const s = await interviewing();
    verification(status, s.org.orgId);
    const expected = await applicantListRefusal(s.ctx, status);

    await expect(
      sendOffer(t.db as Db, s.ctx, s.applicationId, { startDate: '2026-11-04', pay }, NOW),
    ).rejects.toMatchObject(expected);
    expect(await t.db.select().from(offers).where(eq(offers.applicationId, s.applicationId))).toEqual([]);
    expect((await entryOf(s.applicationId))?.status).toBe('interviewing');
    expect(messagingFake.calls.some((c) => c.name === 'ensureThread')).toBe(false);
    expect(await t.db.select().from(notifications).where(eq(notifications.userId, s.seeker.userId))).toEqual([]);
  });

  it.each(REFUSED)('refuses canceling an offer sent while verified, once verification is %s', async (status) => {
    const s = await interviewing();
    const sent = await sendOffer(t.db as Db, s.ctx, s.applicationId, { startDate: '2026-11-04', pay }, NOW);
    verification(status, s.org.orgId);
    const expected = await applicantListRefusal(s.ctx, status);
    messagingFake.calls.length = 0;

    await expect(cancelOffer(t.db as Db, s.ctx, sent.id, NOW)).rejects.toMatchObject(expected);
    const [row] = await t.db.select().from(offers).where(eq(offers.id, sent.id));
    expect(row?.status).toBe('sent');
    expect((await entryOf(s.applicationId))?.status).toBe('offered');
    expect(messagingFake.calls.some((c) => c.name === 'postEvent')).toBe(false);
  });

  it('lets a verified host send and cancel', async () => {
    const s = await interviewing();
    const sent = await sendOffer(t.db as Db, s.ctx, s.applicationId, { startDate: '2026-11-04', pay }, NOW);
    expect(sent.status).toBe('sent');
    expect((await cancelOffer(t.db as Db, s.ctx, sent.id, NOW)).status).toBe('canceled');
  });

  it('answers the host offer routes with the 409 for a failed host', async () => {
    const s = await interviewing();
    const sent = await sendOffer(t.db as Db, s.ctx, s.applicationId, { startDate: '2026-11-04', pay }, NOW);
    const fresh = await interviewing();
    verification('failed', s.org.orgId, fresh.org.orgId);
    const refused = { error: { code: 'conflict', details: { reason: 'verification_failed' } } };

    asHost(s.ctx);
    const cancel = await call(CANCEL, request('POST', `/api/v1/host/offers/${sent.id}/cancel`), { id: sent.id });
    asHost(fresh.ctx);
    // A start date far ahead, because the route reads the real clock.
    const send = await call(
      SEND,
      request('POST', `/api/v1/host/applicants/${fresh.applicationId}/offers`, {
        body: { startDate: '2099-01-01', pay },
      }),
      { applicationId: fresh.applicationId },
    );
    for (const res of [cancel, send]) {
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject(refused);
    }
  });
});
