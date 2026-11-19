// Seeker answers to an offer from a host the applicant gate refuses (issue 212, the follow-up to
// 198). Accepting or declining tells the host the seeker's first name. So while the host is
// refused (never verified, running, needs_review, needs_info or failed), both get the invite's
// neutral 409 `not_taking_answers`, and nothing is written or sent: the offer stays `sent`, the
// application stays `offered`, and there is no thread event, notification, audit row or name read.
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, notifications, offers, pipelineEntries, pipelineEvents } from '@/db/schema';
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
import { POST as ACCEPT } from '@/app/api/v1/me/offers/[id]/accept/route';
import { POST as DECLINE } from '@/app/api/v1/me/offers/[id]/decline/route';
import { INVITE_NOT_TAKING_ANSWERS } from '../invites/respond';
import { acceptOffer, declineOffer, sendOffer } from './offers';

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
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;
const pay = { amountCents: 2200, unit: 'hour' as const };

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

/** An offer the host sent while verified, to a seeker named Maya. */
async function offered() {
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
  const sent = await sendOffer(t.db as Db, org.owner.ctx, applicationId, { startDate: '2099-01-01', pay }, NOW);
  return { org, seeker, listingId, applicationId, offerId: sent.id };
}

async function snapshot(s: { org: { orgId: string }; applicationId: string; offerId: string }) {
  const [offer] = await t.db.select().from(offers).where(eq(offers.id, s.offerId));
  const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, s.applicationId));
  return {
    offer,
    entry,
    events: await t.db.select().from(pipelineEvents).where(eq(pipelineEvents.applicationId, s.applicationId)),
    notifications: await t.db.select().from(notifications),
    audit: await t.db.select().from(auditEvents).where(eq(auditEvents.orgId, s.org.orgId)),
  };
}

function clearCalls(): void {
  applicationsFake.calls.length = 0;
  messagingFake.calls.length = 0;
  names.getCommunityIdentities.mockClear();
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

describe('seeker offer answers to a refused host', () => {
  it.each(REFUSED)('refuses accepting and declining while verification is %s, and writes and sends nothing', async (status) => {
    const s = await offered();
    const before = await snapshot(s);
    verification(status, s.org.orgId);
    clearCalls();

    expectNeutral(await refusal(() => acceptOffer(t.db as Db, s.seeker.userId, s.offerId, NOW)));
    expectNeutral(await refusal(() => declineOffer(t.db as Db, s.seeker.userId, s.offerId, NOW)));

    expect(await snapshot(s)).toEqual(before);
    expect(before.offer?.status).toBe('sent');
    expect(before.entry?.status).toBe('offered');
    expect(messagingFake.calls.map((c) => c.name)).toEqual([]);
    expect(applicationsFake.calls.map((c) => c.name)).toEqual([]);
    expect(names.getCommunityIdentities).not.toHaveBeenCalled();
  });

  it('still answers not found to another seeker, so the refusal names no offer', async () => {
    const s = await offered();
    const other = await seedSeeker(t.db);
    verification('failed', s.org.orgId);
    await expect(acceptOffer(t.db as Db, other.userId, s.offerId, NOW)).rejects.toMatchObject({
      status: 404,
      details: { reason: 'not_found' },
    });
  });

  it('takes both answers from a verified host, which is told the first name', async () => {
    const accepted = await offered();
    const declined = await offered();
    expect((await acceptOffer(t.db as Db, accepted.seeker.userId, accepted.offerId, NOW)).applicationStatus).toBe('hired');
    expect((await declineOffer(t.db as Db, declined.seeker.userId, declined.offerId, NOW)).status).toBe('declined');

    for (const [s, yes] of [
      [accepted, true],
      [declined, false],
    ] as const) {
      const told = await t.db.select().from(notifications).where(eq(notifications.userId, s.org.owner.userId));
      expect(told.find((n) => n.type === 'hiring.offer_response')?.data).toMatchObject({
        firstName: 'Maya',
        accepted: yes,
      });
    }
  });

  it('takes the answer once the host is verified again', async () => {
    const s = await offered();
    verification('running', s.org.orgId);
    await expect(acceptOffer(t.db as Db, s.seeker.userId, s.offerId, NOW)).rejects.toMatchObject(NEUTRAL);
    vi.restoreAllMocks();
    expect((await acceptOffer(t.db as Db, s.seeker.userId, s.offerId, NOW)).offer.status).toBe('accepted');
  });

  it('answers the seeker offer routes with the neutral 409 for a failed host', async () => {
    const accepting = await offered();
    const declining = await offered();
    verification('failed', accepting.org.orgId, declining.org.orgId);

    asSeeker(accepting.seeker.user);
    const accept = await call(ACCEPT, request('POST', `/api/v1/me/offers/${accepting.offerId}/accept`), {
      id: accepting.offerId,
    });
    asSeeker(declining.seeker.user);
    const decline = await call(DECLINE, request('POST', `/api/v1/me/offers/${declining.offerId}/decline`), {
      id: declining.offerId,
    });

    for (const res of [accept, decline]) {
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: { code: 'conflict', message: INVITE_NOT_TAKING_ANSWERS, details: { reason: 'not_taking_answers' } },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/verif|failed/i);
    }
    for (const s of [accepting, declining]) {
      const [row] = await t.db.select().from(offers).where(eq(offers.id, s.offerId));
      expect(row?.status).toBe('sent');
    }
  });
});
