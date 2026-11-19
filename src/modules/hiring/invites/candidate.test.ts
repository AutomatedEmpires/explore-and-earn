// The Interested profile (SP5 plan Task 15, plan decision 16): a host sees the seeker at SP4's
// `interested` stage only after the seeker answers Interested and a reveal exists, only on a
// listing in scope, and never when SP4 drops the card (a block either way).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimited } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { CandidateCard, PoolCard, ProfileSnapshotV1 } from '@/lib/profiles';
import type { HostContext } from '@/server/guards';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { profilesFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { FIXED_NOW, seedHostOrg, seedInvite, seedMember, seedSeeker } from '@tests/helpers/sp5';

const mocks = vi.hoisted(() => ({
  getCandidateCards: vi.fn(),
  revealed: new Set<string>(),
  hostApplicantGate: vi.fn(),
  requireProfileView: vi.fn(),
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
  ...(await import('@tests/fakes/sp5/sp4')).profilesFake,
  getCandidateCards: mocks.getCandidateCards,
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
  requireProfileView: mocks.requireProfileView,
}));

import '../notification-types';
import { getInterestedCandidate } from './reads';
import { respondToInvite } from './respond';

const NOW = FIXED_NOW;

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
    avatarMediaId: '019a4a3c-0000-7000-8000-00000000a001',
    coverMediaId: null,
    categories: ['seasonal'],
  };
}

function profile(): ProfileSnapshotV1 {
  return {
    firstName: 'Maya',
    lastName: 'Rodriguez',
    email: 'maya@example.test',
    phone: null,
    city: 'Denver',
    region: 'CO',
    countryCode: 'US',
    headline: 'Lift operator',
    bio: '',
    avatarMediaId: null,
    coverMediaId: null,
    availability: { date: '2026-12-01', confirmedAt: '2026-11-01T00:00:00.000Z' },
    workAuthorization: null,
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
    portfolioLinks: [],
  };
}

/** SP4's `interested` stage: a card only where a reveal exists for the org. */
async function interestedCards(_db: unknown, i: { orgId: string; seekerUserIds: string[]; stage: string }) {
  if (i.stage !== 'interested') return profilesFake.getCandidateCards(_db as never, i as never);
  return i.seekerUserIds.flatMap((id): CandidateCard[] =>
    mocks.revealed.has(`${i.orgId}:${id}`) ? [{ stage: 'interested', card: card(id), profile: profile() }] : [],
  );
}

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
  profilesFake.reset();
  safetyFake.reset();
  messagingFake.reset();
  mocks.revealed.clear();
  mocks.getCandidateCards.mockReset();
  mocks.getCandidateCards.mockImplementation(interestedCards);
  mocks.hostApplicantGate.mockReset();
  mocks.hostApplicantGate.mockResolvedValue({ ok: true });
  mocks.requireProfileView.mockReset();
  mocks.requireProfileView.mockResolvedValue(undefined);
});

function setRevealed(orgId: string, seekerUserId: string): void {
  profilesFake.setRevealed(orgId, seekerUserId);
  mocks.revealed.add(`${orgId}:${seekerUserId}`);
}

type Setup = { ctx: HostContext; orgId: string; listingId: string; seekerUserId: string; inviteId: string };

async function setup(): Promise<Setup> {
  const org = await seedHostOrg(t.db);
  orgsFake.setAccess(org.owner.userId, { all: true });
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId });
  const { userId } = await seedSeeker(t.db);
  const inviteId = await seedInvite(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: userId,
    sentBy: org.owner.userId,
  });
  return { ctx: org.owner.ctx, orgId: org.orgId, listingId, seekerUserId: userId, inviteId };
}

describe('getInterestedCandidate', () => {
  it('is 404 on a sent invite and never asks SP4', async () => {
    const s = await setup();
    await expect(getInterestedCandidate(t.db, s.ctx, s.inviteId, NOW)).rejects.toMatchObject({ code: 'not_found' });
    expect(mocks.getCandidateCards).not.toHaveBeenCalled();
  });

  it('returns the interested-stage candidate after Interested and a reveal', async () => {
    const s = await setup();
    await respondToInvite(t.db, s.seekerUserId, s.inviteId, { response: 'interested' }, NOW);
    setRevealed(s.orgId, s.seekerUserId);
    const r = await getInterestedCandidate(t.db, s.ctx, s.inviteId, NOW);
    expect(mocks.getCandidateCards).toHaveBeenCalledWith(expect.anything(), {
      orgId: s.orgId,
      seekerUserIds: [s.seekerUserId],
      stage: 'interested',
    });
    expect(r.invite).toMatchObject({ inviteId: s.inviteId, status: 'interested' });
    expect(r.candidate.stage).toBe('interested');
    if (r.candidate.stage !== 'interested') throw new Error('stage');
    expect(r.candidate.profile).toMatchObject({ lastName: 'Rodriguez', email: 'maya@example.test' });
    expect(r.candidate.profile.workAuthorization).toBeNull();
    // The photo follows the seeker's own "Show my photo to hosts" choice, carried by the profile.
    expect(r.candidate.card.avatarMediaId).toBeNull();
  });

  it('is 404 for a Not interested invite', async () => {
    const s = await setup();
    await respondToInvite(t.db, s.seekerUserId, s.inviteId, { response: 'not_interested' }, NOW);
    setRevealed(s.orgId, s.seekerUserId);
    await expect(getInterestedCandidate(t.db, s.ctx, s.inviteId, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('is 404 when SP4 drops the card (a block either way)', async () => {
    const s = await setup();
    await respondToInvite(t.db, s.seekerUserId, s.inviteId, { response: 'interested' }, NOW);
    await expect(getInterestedCandidate(t.db, s.ctx, s.inviteId, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('is 404 for a Recruiter outside the listing scope and for another org', async () => {
    const s = await setup();
    await respondToInvite(t.db, s.seekerUserId, s.inviteId, { response: 'interested' }, NOW);
    setRevealed(s.orgId, s.seekerUserId);
    const recruiter = await seedMember(t.db, s.orgId, 'recruiter', { scope: 'assigned' });
    orgsFake.setAccess(recruiter.userId, { all: false, listingIds: [], locationIds: [] });
    await expect(getInterestedCandidate(t.db, recruiter.ctx, s.inviteId, NOW)).rejects.toMatchObject({
      code: 'not_found',
    });
    const other = await seedHostOrg(t.db);
    orgsFake.setAccess(other.owner.userId, { all: true });
    await expect(getInterestedCandidate(t.db, other.owner.ctx, s.inviteId, NOW)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('refuses until business verification clears (issue 117)', async () => {
    const s = await setup();
    await respondToInvite(t.db, s.seekerUserId, s.inviteId, { response: 'interested' }, NOW);
    setRevealed(s.orgId, s.seekerUserId);
    mocks.hostApplicantGate.mockResolvedValue({ ok: false, reason: 'failed' });
    await expect(getInterestedCandidate(t.db, s.ctx, s.inviteId, NOW)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'verification_failed' },
    });
    expect(mocks.getCandidateCards).not.toHaveBeenCalled();
  });

  it("counts the view of the seeker's profile against the new-host daily cap (legal review 7.3)", async () => {
    const s = await setup();
    await respondToInvite(t.db, s.seekerUserId, s.inviteId, { response: 'interested' }, NOW);
    setRevealed(s.orgId, s.seekerUserId);
    await getInterestedCandidate(t.db, s.ctx, s.inviteId, NOW);
    expect(mocks.requireProfileView).toHaveBeenCalledWith(expect.anything(), s.orgId, s.seekerUserId, NOW);

    mocks.getCandidateCards.mockClear();
    mocks.requireProfileView.mockRejectedValueOnce(
      rateLimited('Over the cap', { reason: 'new_host_daily_cap' }),
    );
    await expect(getInterestedCandidate(t.db, s.ctx, s.inviteId, NOW)).rejects.toMatchObject({
      status: 429,
      details: { reason: 'new_host_daily_cap' },
    });
    expect(mocks.getCandidateCards).not.toHaveBeenCalled();
  });

  it('counts no view for an invite it refuses', async () => {
    const s = await setup();
    await expect(getInterestedCandidate(t.db, s.ctx, s.inviteId, NOW)).rejects.toMatchObject({ code: 'not_found' });
    // Answered while the host was verified: a refused host gets no Interested answer (issue 198).
    await respondToInvite(t.db, s.seekerUserId, s.inviteId, { response: 'interested' }, NOW);
    mocks.hostApplicantGate.mockResolvedValue({ ok: false, reason: 'unverified' });
    await expect(getInterestedCandidate(t.db, s.ctx, s.inviteId, NOW)).rejects.toMatchObject({
      details: { reason: 'verification_unverified' },
    });
    expect(mocks.requireProfileView).not.toHaveBeenCalled();
  });
});
