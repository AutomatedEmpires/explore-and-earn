// Sending invites (SP5 plan Task 14, spec 8.4, E4): one credit in the invite transaction, the
// weekly cap across hosts, live eligibility, blocks and mutes, the note scan, the held-invite
// trust handlers, the verification gate and the new-host daily cap.
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { PoolCard } from '@/lib/profiles';
import { auditEvents, outbox } from '@/db/schema';
import { decide, openReviewItem } from '@/modules/trust';
import type { HostContext } from '@/server/guards';
import { candidatePoolEntries, invites, pipelineEvents } from '../schema';
import { entitlementsFake, listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { profilesFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { FIXED_NOW, seedHostOrg, seedInvite, seedSeeker } from '@tests/helpers/sp5';

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  getCandidateCards: vi.fn(),
  getCommunityIdentities: vi.fn(),
  hostApplicantGate: vi.fn(),
  consumeNewHostDaily: vi.fn(),
}));

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));
vi.mock('@/modules/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/modules/entitlements')>()),
  ...(await import('@tests/fakes/sp5/sp2')).entitlementsFake,
  consume: mocks.consume,
}));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  ...(await import('@tests/fakes/sp5/sp4')).profilesFake,
  getCandidateCards: mocks.getCandidateCards,
  getCommunityIdentities: mocks.getCommunityIdentities,
}));
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/modules/verification', async (orig) => ({
  ...(await orig<typeof import('@/modules/verification')>()),
  hostApplicantGate: mocks.hostApplicantGate,
}));
vi.mock('@/modules/ratelimit', async (orig) => ({
  ...(await orig<typeof import('@/modules/ratelimit')>()),
  consumeNewHostDaily: mocks.consumeNewHostDaily,
}));

import '../notification-types';
import { releaseInviteNote } from './notes';
import { sendInvite } from './send';
import './register';

const NOW = FIXED_NOW;
const DAY = 86_400_000;
const CHECK = '11111111-1111-4111-8111-111111111111';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
  entitlementsFake.reset();
  profilesFake.reset();
  safetyFake.reset();
  mocks.consume.mockReset();
  mocks.consume.mockImplementation(entitlementsFake.consume);
  mocks.getCandidateCards.mockReset();
  mocks.getCandidateCards.mockImplementation(profilesFake.getCandidateCards);
  mocks.getCommunityIdentities.mockReset();
  mocks.getCommunityIdentities.mockImplementation(async (_db: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { displayName: 'Maya Rodriguez', firstName: 'Maya', lastInitial: 'R', avatarMediaId: null }])),
  );
  mocks.hostApplicantGate.mockReset();
  mocks.hostApplicantGate.mockResolvedValue({ ok: true });
  mocks.consumeNewHostDaily.mockReset();
  mocks.consumeNewHostDaily.mockResolvedValue({ allowed: true, remaining: 9, resetAt: NOW, limited: false });
});

type Setup = { ctx: HostContext; orgId: string; userId: string; listingId: string; seekerUserId: string; candidateId: string };

function card(seekerUserId: string): PoolCard {
  return {
    seekerUserId,
    firstName: 'Maya',
    lastInitial: 'R',
    city: 'Denver',
    region: 'CO',
    countryCode: 'US',
    availabilityDate: '2026-12-01',
    skills: [],
    avatarMediaId: null,
    coverMediaId: null,
    categories: ['seasonal'],
  };
}

async function setup(o: { credits?: number; status?: 'active' | 'closed' } = {}): Promise<Setup> {
  const org = await seedHostOrg(t.db);
  orgsFake.setAccess(org.owner.userId, { all: true });
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge Lodge');
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, status: o.status ?? 'active', publishedRevisionId: newId() });
  const { userId: seekerUserId } = await seedSeeker(t.db);
  profilesFake.setPoolSeeker(card(seekerUserId), {
    seekerUserId,
    categories: ['seasonal'],
    occupationCodes: [],
    availabilityDate: '2026-12-01',
    skillKeys: [],
    certifications: [],
    workAuthorization: { status: 'authorized' },
    minPay: null,
    willingToRelocate: false,
    preferredStates: [],
    region: 'CO',
    countryCode: 'US',
  });
  const candidateId = newId();
  await t.db.insert(candidatePoolEntries).values({
    id: candidateId,
    listingId,
    orgId: org.orgId,
    seekerUserId,
    eligible: true,
    computedAt: NOW,
  });
  entitlementsFake.setCredits(org.orgId, o.credits ?? 10);
  return { ctx: org.owner.ctx, orgId: org.orgId, userId: org.owner.userId, listingId, seekerUserId, candidateId };
}

async function notificationsFor(userId: string, type = 'hiring.invite_received') {
  return queryRows<{ data: Record<string, unknown> }>(
    t.db,
    sql`select data from app.notifications where user_id = ${userId}::uuid and type = ${type}`,
  );
}

async function inviteRows(s: Setup) {
  return t.db
    .select()
    .from(invites)
    .where(and(eq(invites.listingId, s.listingId), eq(invites.seekerUserId, s.seekerUserId)));
}

async function otherOrgInvites(s: Setup, n: number, o: { sentAt?: Date; held?: number } = {}): Promise<void> {
  for (let k = 0; k < n; k += 1) {
    await seedInvite(t.db, {
      orgId: newId(),
      listingId: newId(),
      seekerUserId: s.seekerUserId,
      sentBy: s.userId,
      sentAt: o.sentAt ?? new Date(NOW.getTime() - DAY),
      scanState: k < (o.held ?? 0) ? 'held' : 'clear',
    });
  }
}

const balance = async (orgId: string) => (await entitlementsFake.getBalance(t.db, orgId, 'invite_credit')).balance;

describe('sendInvite', () => {
  it('spends one credit, sends the invite and tells the seeker', async () => {
    const s = await setup();
    const { invite } = await sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW);
    expect(await balance(s.orgId)).toBe(9);
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(mocks.consume.mock.calls[0]?.[1]).toEqual({
      orgId: s.orgId,
      kind: 'invite_credit',
      quantity: 1,
      subjectType: 'invite',
      subjectId: invite.inviteId,
      idempotencyKey: `invite:${invite.inviteId}`,
      actor: { type: 'user', id: s.userId },
    });
    expect(invite).toMatchObject({
      listingId: s.listingId,
      listingTitle: 'Lift Operator',
      candidateId: s.candidateId,
      firstName: 'Maya',
      lastInitial: 'R',
      status: 'sent',
      declineReason: null,
      sentAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 14 * DAY).toISOString(),
      respondedAt: null,
      threadId: null,
    });
    const [row] = await inviteRows(s);
    expect(row).toMatchObject({ status: 'sent', scanState: 'clear', sentBy: s.userId, note: null });
    const sent = await notificationsFor(s.seekerUserId);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.data).toMatchObject({
      inviteId: invite.inviteId,
      orgName: 'Kettle Ridge Lodge',
      audience: 'seeker',
      url: `/inbox/invites/${invite.inviteId}`,
    });

    const events = await t.db.select().from(pipelineEvents).where(eq(pipelineEvents.inviteId, invite.inviteId));
    expect(events.map((e) => [e.kind, e.actorType])).toEqual([['invite_sent', 'host']]);
    const audits = await t.db.select().from(auditEvents).where(eq(auditEvents.subjectId, invite.inviteId));
    expect(audits.map((a) => a.action)).toEqual(['hiring.invite_sent']);
    expect(mocks.consumeNewHostDaily).toHaveBeenCalledWith(expect.anything(), s.orgId, 'invites', expect.any(Date), NOW);
  });

  it('holds a note for the scan and tells no one until it is released', async () => {
    const s = await setup();
    const { invite } = await sendInvite(t.db, s.ctx, { candidateId: s.candidateId, note: 'We loved your profile.' }, NOW);
    const [row] = await inviteRows(s);
    expect(row).toMatchObject({ scanState: 'pending', note: 'We loved your profile.' });
    const jobs = await t.db.select().from(outbox).where(eq(outbox.dedupeKey, `note:invite:${invite.inviteId}`));
    expect(jobs.map((j) => j.topic)).toEqual(['hiring.scan_note']);
    expect(await notificationsFor(s.seekerUserId)).toHaveLength(0);
    const audits = await t.db.select().from(auditEvents).where(eq(auditEvents.subjectId, invite.inviteId));
    expect(JSON.stringify(audits.map((a) => a.data))).not.toContain('loved');

    await withTx(t.db, (tx) => releaseInviteNote(tx, invite.inviteId, { state: 'warn', checkId: CHECK, labels: [] }));
    expect(await notificationsFor(s.seekerUserId)).toHaveLength(1);
    const [released] = await inviteRows(s);
    expect(released).toMatchObject({ scanState: 'warn', checkId: CHECK });

    await withTx(t.db, (tx) => releaseInviteNote(tx, invite.inviteId, { state: 'held', checkId: CHECK, labels: [] }));
    const [again] = await inviteRows(s);
    expect(again?.scanState).toBe('warn');
  });

  it('notifies no one when the note is held', async () => {
    const s = await setup();
    const { invite } = await sendInvite(t.db, s.ctx, { candidateId: s.candidateId, note: 'Send a deposit' }, NOW);
    await withTx(t.db, (tx) => releaseInviteNote(tx, invite.inviteId, { state: 'held', checkId: CHECK, labels: ['payment_request'] }));
    const [row] = await inviteRows(s);
    expect(row?.scanState).toBe('held');
    expect(await notificationsFor(s.seekerUserId)).toHaveLength(0);
  });

  it('refuses a second invite to the same candidate without spending again', async () => {
    const s = await setup();
    await sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW);
    await expect(sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'already_invited' },
    });
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(await balance(s.orgId)).toBe(9);
  });

  it('refuses a seeker at the weekly cap across hosts, without spending (E4)', async () => {
    const s = await setup();
    await otherOrgInvites(s, 10);
    await expect(sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW)).rejects.toMatchObject({
      code: 'conflict',
      message: 'Not accepting invites right now',
      details: { reason: 'seeker_unavailable' },
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(await inviteRows(s)).toHaveLength(0);
  });

  it('does not count held invites or invites older than 7 days', async () => {
    const held = await setup();
    await otherOrgInvites(held, 10, { held: 1 });
    await expect(sendInvite(t.db, held.ctx, { candidateId: held.candidateId }, NOW)).resolves.toBeDefined();

    const old = await setup();
    await otherOrgInvites(old, 10, { sentAt: new Date(NOW.getTime() - 8 * DAY) });
    await expect(sendInvite(t.db, old.ctx, { candidateId: old.candidateId }, NOW)).resolves.toBeDefined();
  });

  it.each(['blocked', 'muted', 'ineligible'] as const)('refuses a %s seeker', async (why) => {
    const s = await setup();
    if (why === 'blocked') safetyFake.setBlocked(s.orgId, s.seekerUserId);
    if (why === 'muted') safetyFake.setMuted(s.orgId, s.seekerUserId);
    if (why === 'ineligible') mocks.getCandidateCards.mockResolvedValue([]);
    await expect(sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW)).rejects.toMatchObject({
      code: 'conflict',
      message: 'Not accepting invites right now',
      details: { reason: 'seeker_unavailable' },
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.getCandidateCards.mock.calls[0]?.[1]).toEqual({
      orgId: s.orgId,
      seekerUserIds: [s.seekerUserId],
      stage: 'pool',
    });
  });

  it('refuses a closed listing', async () => {
    const s = await setup({ status: 'closed' });
    await expect(sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW)).rejects.toMatchObject({
      details: { reason: 'listing_inactive' },
    });
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('refuses with no credits and writes no invite', async () => {
    const s = await setup({ credits: 0 });
    await expect(sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW)).rejects.toMatchObject({
      code: 'conflict',
      message: "You're out of invite credits",
      details: { reason: 'no_credits' },
    });
    expect(await inviteRows(s)).toHaveLength(0);
  });

  it('writes no invite when spending the credit fails', async () => {
    const s = await setup();
    mocks.consume.mockRejectedValue(new Error('ledger down'));
    await expect(sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW)).rejects.toThrow('ledger down');
    expect(await inviteRows(s)).toHaveLength(0);
    expect(await notificationsFor(s.seekerUserId)).toHaveLength(0);
  });

  it('refuses until business verification clears (issue 117)', async () => {
    const s = await setup();
    mocks.hostApplicantGate.mockResolvedValue({ ok: false, reason: 'running' });
    await expect(sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'verification_running' },
    });
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("caps a new host's invites for the day (issue 117)", async () => {
    const s = await setup();
    mocks.consumeNewHostDaily.mockResolvedValue({ allowed: false, remaining: 0, resetAt: NOW, limited: true });
    await expect(sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW)).rejects.toMatchObject({
      code: 'rate_limited',
      details: { reason: 'new_host_daily_cap' },
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(await inviteRows(s)).toHaveLength(0);
  });

  it("is 404 for another org's candidate or a listing outside scope", async () => {
    const s = await setup();
    const other = await seedHostOrg(t.db);
    orgsFake.setAccess(other.owner.userId, { all: true });
    await expect(sendInvite(t.db, other.owner.ctx, { candidateId: s.candidateId }, NOW)).rejects.toMatchObject({
      code: 'not_found',
    });
    orgsFake.setAccess(s.userId, { all: false, listingIds: [], locationIds: [] });
    await expect(sendInvite(t.db, s.ctx, { candidateId: s.candidateId }, NOW)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('invite trust handlers', () => {
  async function operator(): Promise<string> {
    const id = newId();
    await t.db.execute(sql`
      insert into app.users (id, clerk_user_id, email, display_name, account_type)
      values (${id}, ${`user_${id}`}, ${`${id}@ops.test`}, 'Operator', 'operator')
    `);
    await t.db.execute(sql`
      insert into app.operators (user_id, role, queues, shift_status)
      values (${id}, 'operator', '{"moderation"}'::text[], 'on_shift')
    `);
    return id;
  }

  it('delivers a held invite on approve without a second charge, and hides it again on remove', async () => {
    const s = await setup();
    // The operator decides on the real clock, so the invite is sent on it too.
    const { invite } = await sendInvite(t.db, s.ctx, { candidateId: s.candidateId, note: 'Hello' }, new Date());
    await withTx(t.db, (tx) => releaseInviteNote(tx, invite.inviteId, { state: 'held', checkId: CHECK, labels: [] }));
    const operatorId = await operator();
    const item = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'invite',
      subjectId: invite.inviteId,
      reason: 'message_scam_held',
    });
    await decide(t.db, item.id, operatorId, 'approve');
    const [row] = await inviteRows(s);
    expect(row?.scanState).toBe('clear');
    expect(await notificationsFor(s.seekerUserId)).toHaveLength(1);
    expect(mocks.consume).toHaveBeenCalledTimes(1);

    const again = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'invite',
      subjectId: invite.inviteId,
      reason: 'reported',
    });
    await decide(t.db, again.id, operatorId, 'remove');
    const [removed] = await inviteRows(s);
    expect(removed?.scanState).toBe('held');
  });
});
