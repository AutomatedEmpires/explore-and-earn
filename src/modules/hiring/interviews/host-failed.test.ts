// A host whose verification is decided failed (issue 212, the follow-up to 198). The applicant
// gate stops it acting on its open interviews and offers, so `hiring.close_for_failed_host` (on
// `verification.decided`) closes them in one transaction and tells each seeker in neutral words
// that never mention verification. The other refused statuses (unverified, running,
// needs_review, needs_info) hold them open instead. A repeat decision changes nothing, and
// neither the notices nor the audit rows carry the seeker's name.
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, interviews, notifications, offers, pipelineEntries, pipelineEvents } from '@/db/schema';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { getType } from '@/modules/notifications';
import type { VerificationStatus } from '@/modules/verification';
import { eventSubscribers } from '@/server/event-subscribers';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { envelope, seedEntry, seedHostOrg, seedInterview, seedSeeker } from '@tests/helpers/sp5';
import * as messaging from '@/modules/messaging';
import * as orgs from '@/modules/orgs';
import { jobHandlers } from '../jobs';
import { sendOffer } from '../offers/offers';
import { closeForFailedHost } from './host-failed';
import { proposeInterview } from './propose';
import { declineInterview, pickSlot, requestNewTimes } from './respond';

const names = vi.hoisted(() => ({ getCommunityIdentities: vi.fn() }));

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

let t: TestDb;
const NOW = new Date('2026-11-03T17:00:00Z');
const LATER = new Date('2026-11-04T09:00:00Z');
const HOUR = 60 * 60_000;
const HELD = ['unverified', 'running', 'needs_review', 'needs_info'] as const;
const TOPIC = 'hiring.close_for_failed_host';
const ACTIVE = ['invited', 'scheduled', 'reschedule_requested'];
const pay = { amountCents: 2200, unit: 'hour' as const };

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

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

function decided(orgId: string, status: VerificationStatus, eventId = newId()) {
  return envelope('verification.decided', { orgId, status }, eventId);
}

const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString();

/**
 * A host, verified while it set these up, with applicants (each named Maya) at every interview
 * and offer state: an invite, a scheduled interview with an open offer, a request for new
 * times, a declined interview, and an invite still waiting on its note scan.
 */
async function host() {
  const org = await seedHostOrg(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge');
  const applicant = async () => {
    const seeker = await seedSeeker(t.db);
    const applicationId = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'interviewing',
    });
    return { seeker, applicationId };
  };
  const propose = async (applicationId: string) => {
    const view = await proposeInterview(
      t.db as Db,
      org.owner.ctx,
      applicationId,
      { slots: [{ start: at(48) }], durationMinutes: 30, format: 'phone', expiryHours: 72 },
      NOW,
    );
    const slotId = view.slots[0]?.id;
    if (!slotId) throw new Error('expected a slot');
    return { interviewId: view.id, slotId };
  };

  const invited = await applicant();
  const invitedIv = await propose(invited.applicationId);

  const offered = await applicant();
  const offeredIv = await propose(offered.applicationId);
  await pickSlot(t.db as Db, offered.seeker.userId, offeredIv.interviewId, { slotId: offeredIv.slotId, round: 1 }, NOW);
  const offer = await sendOffer(t.db as Db, org.owner.ctx, offered.applicationId, { startDate: '2099-01-01', pay }, NOW);

  const asked = await applicant();
  const askedIv = await propose(asked.applicationId);
  await pickSlot(t.db as Db, asked.seeker.userId, askedIv.interviewId, { slotId: askedIv.slotId, round: 1 }, NOW);
  await requestNewTimes(
    t.db as Db,
    asked.seeker.userId,
    askedIv.interviewId,
    { windows: [{ start: at(96), end: at(98) }] },
    NOW,
  );

  const declined = await applicant();
  const declinedIv = await propose(declined.applicationId);
  await declineInterview(t.db as Db, declined.seeker.userId, declinedIv.interviewId, { alsoWithdraw: false }, NOW);

  const pending = await applicant();
  const pendingId = await seedInterview(t.db, {
    orgId: org.orgId,
    listingId,
    applicationId: pending.applicationId,
    threadId: newId(),
    organizerUserId: org.owner.userId,
  });
  await t.db.update(interviews).set({ scanState: 'pending' }).where(eq(interviews.id, pendingId));

  return {
    org,
    listingId,
    invited: { ...invited, interviewId: invitedIv.interviewId },
    offered: { ...offered, interviewId: offeredIv.interviewId, offerId: offer.id },
    asked: { ...asked, interviewId: askedIv.interviewId },
    declined: { ...declined, interviewId: declinedIv.interviewId },
    pending: { ...pending, interviewId: pendingId },
  };
}

type Host = Awaited<ReturnType<typeof host>>;

/** Everything the close writes for this org, to compare across runs. */
async function state(h: Host) {
  return {
    interviews: await t.db
      .select()
      .from(interviews)
      .where(eq(interviews.orgId, h.org.orgId))
      .orderBy(interviews.id),
    offers: await t.db.select().from(offers).where(eq(offers.orgId, h.org.orgId)).orderBy(offers.id),
    entries: await t.db
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.orgId, h.org.orgId))
      .orderBy(pipelineEntries.applicationId),
    events: await t.db.select().from(pipelineEvents).where(eq(pipelineEvents.orgId, h.org.orgId)),
    notifications: await t.db.select().from(notifications).orderBy(notifications.id),
    audit: await t.db.select().from(auditEvents).where(eq(auditEvents.orgId, h.org.orgId)).orderBy(auditEvents.id),
  };
}

async function statusOf(interviewId: string): Promise<string | undefined> {
  const [row] = await t.db.select().from(interviews).where(eq(interviews.id, interviewId));
  return row?.status;
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

describe('closing a failed host’s open interviews and offers', () => {
  it('cancels every open interview and offer of the org, and leaves closed ones and other hosts alone', async () => {
    const h = await host();
    const other = await host();
    const otherBefore = await state(other);
    verification('failed', h.org.orgId);

    await closeForFailedHost(t.db as Db, decided(h.org.orgId, 'failed'), LATER);

    for (const s of [h.invited, h.offered, h.asked, h.pending]) {
      expect(await statusOf(s.interviewId), s.interviewId).toBe('canceled');
      const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, s.applicationId));
      expect(entry?.interviewState).toBe('canceled');
    }
    expect(await statusOf(h.declined.interviewId)).toBe('declined');
    const [offer] = await t.db.select().from(offers).where(eq(offers.id, h.offered.offerId));
    expect(offer).toMatchObject({ status: 'canceled', respondedAt: LATER });
    // As a host cancel does: the application goes back to interviewing, by the system.
    const [entry] = await t.db
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, h.offered.applicationId));
    expect(entry).toMatchObject({ status: 'interviewing', offerState: 'canceled' });
    const kinds = await t.db
      .select()
      .from(pipelineEvents)
      .where(and(eq(pipelineEvents.applicationId, h.offered.applicationId), eq(pipelineEvents.kind, 'offer_canceled')));
    expect(kinds).toEqual([expect.objectContaining({ actorType: 'system', actorUserId: null })]);
    expect(applicationsFake.calls.filter((c) => c.name === 'setStatus').map((c) => c.args[0])).toContainEqual(
      expect.objectContaining({ applicationId: h.offered.applicationId, to: 'interviewing', actor: { type: 'system' } }),
    );

    // Every interview the sequence moved is one past what the seeker's calendar last saw.
    const [scheduledRow] = await t.db.select().from(interviews).where(eq(interviews.id, h.offered.interviewId));
    expect(scheduledRow?.sequence).toBe(2);

    expect(await state(other)).toEqual({ ...otherBefore, notifications: expect.any(Array) as unknown });
    const otherOpen = await t.db
      .select()
      .from(interviews)
      .where(and(eq(interviews.orgId, other.org.orgId), inArray(interviews.status, ACTIVE)));
    expect(otherOpen).toHaveLength(4);
  });

  it('tells each seeker in neutral words, without their name, and posts the thread events', async () => {
    const h = await host();
    verification('failed', h.org.orgId);
    const before = new Set((await t.db.select({ id: notifications.id }).from(notifications)).map((n) => n.id));
    messagingFake.calls.length = 0;
    names.getCommunityIdentities.mockClear();

    await closeForFailedHost(t.db as Db, decided(h.org.orgId, 'failed'), LATER);

    const sent = (await t.db.select().from(notifications)).filter((n) => !before.has(n.id));
    const to = (userId: string) => sent.filter((n) => n.userId === userId).map((n) => n.type).sort();
    expect(to(h.invited.seeker.userId)).toEqual(['hiring.interview_canceled']);
    expect(to(h.offered.seeker.userId)).toEqual(['hiring.interview_canceled', 'hiring.offer_canceled']);
    expect(to(h.asked.seeker.userId)).toEqual(['hiring.interview_canceled']);
    // The seeker never saw an invite still waiting on its scan, or a closed one.
    expect(to(h.pending.seeker.userId)).toEqual([]);
    expect(to(h.declined.seeker.userId)).toEqual([]);
    // Nothing goes to the host.
    expect(sent.every((n) => n.userId !== h.org.owner.userId)).toBe(true);
    expect(sent).toHaveLength(4);

    const offerNotice = sent.find((n) => n.type === 'hiring.offer_canceled');
    expect(offerNotice).toMatchObject({ title: 'Offer canceled: Deckhand' });
    expect(offerNotice?.data).toMatchObject({
      offerId: h.offered.offerId,
      audience: 'seeker',
      orgName: 'Kettle Ridge',
      position: 'Deckhand',
    });
    const scheduledNotice = sent.find(
      (n) => n.userId === h.offered.seeker.userId && n.type === 'hiring.interview_canceled',
    );
    expect(scheduledNotice).toMatchObject({ title: 'Interview canceled: Deckhand' });
    // The calendar file cancels the time the seeker booked.
    expect(scheduledNotice?.data).toMatchObject({
      interviewId: h.offered.interviewId,
      audience: 'seeker',
      icsMethod: 'CANCEL',
      start: at(48),
      sequence: 2,
    });

    for (const n of sent) {
      const text = JSON.stringify({ title: n.title, body: n.body, data: n.data });
      expect(text).not.toMatch(/verif|fail|fraud|review/i);
      expect(text).not.toContain('Maya');
      expect(n.data).not.toHaveProperty('firstName');
    }
    expect(names.getCommunityIdentities).not.toHaveBeenCalled();

    const posted = messagingFake.calls
      .filter((c) => c.name === 'postEvent')
      .map((c) => c.args[1] as { code: string; visibleTo: string });
    expect(posted).toEqual(
      expect.arrayContaining([
        { code: 'interview_canceled', visibleTo: 'all' },
        { code: 'interview_canceled', visibleTo: 'host' },
        { code: 'offer_canceled', visibleTo: 'all' },
      ]),
    );
    expect(posted).toHaveLength(5);
  });

  it('audits each close as the system, with ids and the reason but no name', async () => {
    const h = await host();
    verification('failed', h.org.orgId);
    const before = new Set((await t.db.select({ id: auditEvents.id }).from(auditEvents)).map((a) => a.id));

    await closeForFailedHost(t.db as Db, decided(h.org.orgId, 'failed'), LATER);

    const rows = (await t.db.select().from(auditEvents)).filter((a) => !before.has(a.id));
    const closes = rows.filter((a) => a.action === 'hiring.interview_canceled' || a.action === 'hiring.offer_canceled');
    expect(closes.map((a) => [a.action, a.subjectId]).sort()).toEqual(
      [
        ['hiring.interview_canceled', h.invited.interviewId],
        ['hiring.interview_canceled', h.offered.interviewId],
        ['hiring.interview_canceled', h.asked.interviewId],
        ['hiring.interview_canceled', h.pending.interviewId],
        ['hiring.offer_canceled', h.offered.offerId],
      ].sort(),
    );
    for (const a of closes) {
      expect(a).toMatchObject({ actorType: 'system', actorId: null, orgId: h.org.orgId });
      expect(a.data).toMatchObject({ reason: 'host_verification_failed' });
    }
    for (const a of rows) {
      expect(JSON.stringify(a)).not.toContain('Maya');
      expect(JSON.stringify(a)).not.toContain(h.offered.seeker.userId);
    }
  });

  it('closes everything in one transaction: a failure part way leaves every item open', async () => {
    const h = await host();
    verification('failed', h.org.orgId);
    const before = await state(h);
    let calls = 0;
    const postEvent = messaging.postEvent;
    vi.spyOn(messaging, 'postEvent').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 3) throw new Error('thread store unavailable');
      return postEvent(...args);
    });

    await expect(closeForFailedHost(t.db as Db, decided(h.org.orgId, 'failed'), LATER)).rejects.toThrow(
      'thread store unavailable',
    );
    expect(await state(h)).toEqual(before);

    // The outbox retries the job, and the retry closes everything.
    vi.mocked(messaging.postEvent).mockRestore();
    await closeForFailedHost(t.db as Db, decided(h.org.orgId, 'failed'), LATER);
    for (const s of [h.invited, h.offered, h.asked, h.pending]) {
      expect(await statusOf(s.interviewId)).toBe('canceled');
    }
  });

  it('does nothing on a repeat decision, or a redelivery of the same one', async () => {
    const h = await host();
    verification('failed', h.org.orgId);
    const first = decided(h.org.orgId, 'failed');
    await closeForFailedHost(t.db as Db, first, LATER);
    const after = await state(h);
    messagingFake.calls.length = 0;

    await closeForFailedHost(t.db as Db, first, new Date(LATER.getTime() + HOUR));
    await closeForFailedHost(t.db as Db, decided(h.org.orgId, 'failed'), new Date(LATER.getTime() + 2 * HOUR));

    expect(await state(h)).toEqual(after);
    expect(messagingFake.calls).toEqual([]);
  });

  it.each(HELD)('holds the open items while verification is %s: nothing closes and nobody is told', async (status) => {
    const h = await host();
    verification(status, h.org.orgId);
    const before = await state(h);
    messagingFake.calls.length = 0;

    await closeForFailedHost(t.db as Db, decided(h.org.orgId, status), LATER);

    expect(await state(h)).toEqual(before);
    expect(messagingFake.calls).toEqual([]);
    for (const s of [h.invited, h.offered, h.asked]) expect(ACTIVE).toContain(await statusOf(s.interviewId));
    const [offer] = await t.db.select().from(offers).where(eq(offers.id, h.offered.offerId));
    expect(offer?.status).toBe('sent');
  });

  it('leaves a verified host alone, and a failed decision the host has since moved past', async () => {
    const h = await host();
    const before = await state(h);

    await closeForFailedHost(t.db as Db, decided(h.org.orgId, 'verified'), LATER);
    // Failed when decided, verified again (an appeal) by the time the job runs.
    await closeForFailedHost(t.db as Db, decided(h.org.orgId, 'failed'), LATER);
    verification('needs_review', h.org.orgId);
    await closeForFailedHost(t.db as Db, decided(h.org.orgId, 'failed'), LATER);

    expect(await state(h)).toEqual(before);
  });

  it('subscribes to verification.decided, and its handler closes through the job registry', async () => {
    expect(eventSubscribers['verification.decided']).toEqual(['listings.resume_screening', TOPIC]);
    const handler = jobHandlers[TOPIC];
    expect(handler).toBeTypeOf('function');
    // The registry probe: no context, no job.
    await expect((handler as (payload: unknown) => Promise<void>)({})).resolves.toBeUndefined();

    const h = await host();
    verification('failed', h.org.orgId);
    await handler?.(decided(h.org.orgId, 'failed'), { db: t.db as Db, now: LATER });
    expect(await statusOf(h.invited.interviewId)).toBe('canceled');
  });

  it('defines the offer notice in plain words', () => {
    const type = getType('hiring.offer_canceled');
    expect(type).toMatchObject({ category: 'applications', push: true, email: { template: 'HiringUpdate' } });
    expect(type?.title({ position: 'Deckhand', orgName: 'Kettle Ridge' })).toBe('Offer canceled: Deckhand');
  });
});
