// Candidate pools (SP5 plan Task 13, spec 8.2): the refresh, the live privacy check, the legal
// switches, ordering, filters, saved and hidden flags, and the verification gate.
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidatesQuery } from '@/lib/hiring';
import type { FitInputs, PoolCard } from '@/lib/profiles';
import { newId } from '@/lib/ids';
import { setSetting } from '@/modules/settings';
import type { HostContext } from '@/server/guards';
import { candidatePoolEntries } from '../schema';
import { entitlementsFake, listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { discoveryFake } from '@tests/fakes/sp5/sp3';
import { profilesFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { FIXED_NOW, seedEntry, seedHostOrg, seedInvite, seedSeeker } from '@tests/helpers/sp5';

const mocks = vi.hoisted(() => ({
  getCandidateCards: vi.fn(),
  hostApplicantGate: vi.fn(),
}));

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
  listOccupations: async () => [
    { code: 'lift_operator', label: 'Lift operator', socCode: '53-7099', categories: ['seasonal'] },
  ],
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));
vi.mock('@/modules/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/modules/entitlements')>()),
  ...(await import('@tests/fakes/sp5/sp2')).entitlementsFake,
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
vi.mock('@/modules/discovery', async (orig) => ({
  ...(await orig<typeof import('@/modules/discovery')>()),
  ...(await import('@tests/fakes/sp5/sp3')).discoveryFake,
}));
vi.mock('@/modules/verification', async (orig) => ({
  ...(await orig<typeof import('@/modules/verification')>()),
  hostApplicantGate: mocks.hostApplicantGate,
}));

import { listCandidates, setCandidateFlag } from './candidates';
import { refreshPool } from './refresh';

const OPERATOR = { operatorId: '019a4a3c-0000-7000-8000-00000000f001' };
const NOW = FIXED_NOW;
const HOUR = 3_600_000;

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  listingsFake.reset();
  orgsFake.reset();
  entitlementsFake.reset();
  profilesFake.reset();
  safetyFake.reset();
  discoveryFake.reset();
  mocks.getCandidateCards.mockReset();
  mocks.getCandidateCards.mockImplementation(profilesFake.getCandidateCards);
  mocks.hostApplicantGate.mockReset();
  mocks.hostApplicantGate.mockResolvedValue({ ok: true });
  await setSetting(t.db, 'hiring.fit_enabled', true, OPERATOR);
  await setSetting(t.db, 'hiring.fit_disabled_states', [], OPERATOR);
});

type Host = { ctx: HostContext; orgId: string; userId: string };

async function host(): Promise<Host> {
  const org = await seedHostOrg(t.db);
  orgsFake.setAccess(org.owner.userId, { all: true });
  return { ctx: org.owner.ctx, orgId: org.orgId, userId: org.owner.userId };
}

function listingFor(h: Host, over: Record<string, unknown> = {}): string {
  const id = newId();
  listingsFake.setListing({
    id,
    orgId: h.orgId,
    occupation: 'lift_operator',
    state: 'CO',
    startDate: '2027-06-01',
    endDate: '2027-08-31',
    skills: ['Customer service', 'Lift operations'],
    publishedRevisionId: newId(),
    ...over,
  });
  return id;
}

async function seeker(over: { card?: Partial<PoolCard>; inputs?: Partial<FitInputs> } = {}): Promise<string> {
  const { userId } = await seedSeeker(t.db);
  profilesFake.setPoolSeeker(
    {
      seekerUserId: userId,
      firstName: 'Maya',
      lastInitial: 'R',
      city: 'Denver',
      region: 'CO',
      countryCode: 'US',
      availabilityDate: '2027-06-01',
      skills: [{ label: 'Customer service', highlighted: true }],
      avatarMediaId: null,
      coverMediaId: null,
      categories: ['seasonal'],
      ...over.card,
    },
    {
      seekerUserId: userId,
      categories: ['seasonal'],
      occupationCodes: ['lift_operator'],
      availabilityDate: over.card?.availabilityDate ?? '2027-06-01',
      skillKeys: ['customer-service'],
      certifications: [],
      workAuthorization: { status: 'authorized' },
      minPay: { cents: 1800, unit: 'hour' },
      willingToRelocate: false,
      preferredStates: ['CO'],
      region: 'CO',
      countryCode: 'US',
      ...over.inputs,
    },
  );
  return userId;
}

const ids = (r: { items: { card: PoolCard }[] }) => r.items.map((i) => i.card.seekerUserId);
const poolQueries = () => profilesFake.calls.filter((c) => c.name === 'queryPoolCandidates').length;

async function list(h: Host, listingId: string, q: Partial<CandidatesQuery> = {}, now = NOW) {
  return listCandidates(t.db, h.ctx, { view: 'all', ...q, listingId }, now);
}

async function setFit(listingId: string, seekerUserId: string, score: number | null): Promise<void> {
  await t.db
    .update(candidatePoolEntries)
    .set({ fitScore: score })
    .where(and(eq(candidatePoolEntries.listingId, listingId), eq(candidatePoolEntries.seekerUserId, seekerUserId)));
}

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysDeep(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe('listCandidates', () => {
  it('scores the pool and reports credits', async () => {
    const h = await host();
    const listingId = listingFor(h);
    const a = await seeker();
    entitlementsFake.setCredits(h.orgId, 7);
    const r = await list(h, listingId);
    expect(r.fitAvailable).toBe(true);
    expect(r.creditsRemaining).toBe(7);
    expect(ids(r)).toEqual([a]);
    expect(r.items[0]?.fit?.score).toBeGreaterThan(0);
    expect(r.items[0]?.fit?.lines[0]?.text).toBe('Interested in Lift operator');
    expect(r.items[0]).toMatchObject({ saved: false, hidden: false, invite: null, avatarUrl: null, coverUrl: null });
  });

  it('turns fit off for a listing in a disabled state, and everywhere with fit_enabled off (E3)', async () => {
    const h = await host();
    await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
    const listingId = listingFor(h, { state: 'CO' });
    await seeker();
    await seeker();
    const off = await list(h, listingId);
    expect(off.fitAvailable).toBe(false);
    expect(off.items).toHaveLength(2);
    expect(off.items.every((i) => i.fit === null)).toBe(true);
    const stored = await t.db.select().from(candidatePoolEntries).where(eq(candidatePoolEntries.listingId, listingId));
    expect(stored.every((row) => row.fitScore === null && row.fitLines === null)).toBe(true);

    await setSetting(t.db, 'hiring.fit_disabled_states', [], OPERATOR);
    await setSetting(t.db, 'hiring.fit_enabled', false, OPERATOR);
    const elsewhere = listingFor(h, { state: 'UT' });
    const none = await list(h, elsewhere);
    expect(none.fitAvailable).toBe(false);
    expect(none.items.every((i) => i.fit === null)).toBe(true);
  });

  it('clears scores stored before fit was turned off', async () => {
    const h = await host();
    const listingId = listingFor(h, { state: 'CO' });
    await seeker();
    expect((await list(h, listingId)).items[0]?.fit).not.toBeNull();
    await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
    const r = await list(h, listingId);
    expect(r.items[0]?.fit).toBeNull();
    const stored = await t.db.select().from(candidatePoolEntries).where(eq(candidatePoolEntries.listingId, listingId));
    expect(stored.every((row) => row.fitScore === null)).toBe(true);
  });

  it('orders by fit, then availability, then id; by availability when fit is off', async () => {
    const h = await host();
    const listingId = listingFor(h, { state: 'UT' });
    const a = await seeker({ card: { availabilityDate: '2027-06-10' } });
    const b = await seeker({ card: { availabilityDate: '2027-06-01' } });
    const c = await seeker({ card: { availabilityDate: '2027-05-01' } });
    await list(h, listingId);
    await setFit(listingId, a, 90);
    await setFit(listingId, b, 90);
    await setFit(listingId, c, 50);
    expect(ids(await list(h, listingId))).toEqual([b, a, c]);
    await setSetting(t.db, 'hiring.fit_enabled', false, OPERATOR);
    expect(ids(await list(h, listingId))).toEqual([c, b, a]);
  });

  it('keeps saved and hidden flags across a refresh and drops seekers SP4 stops returning', async () => {
    const h = await host();
    const listingId = listingFor(h);
    const kept = await seeker();
    const gone = await seeker();
    const first = await list(h, listingId);
    const keptId = first.items.find((i) => i.card.seekerUserId === kept)?.candidateId ?? '';
    await setCandidateFlag(t.db, h.ctx, keptId, 'saved', true);
    await setCandidateFlag(t.db, h.ctx, keptId, 'hidden', true);

    profilesFake.reset();
    profilesFake.setPoolSeeker(
      { ...(first.items.find((i) => i.card.seekerUserId === kept)?.card as PoolCard) },
      {
        seekerUserId: kept,
        categories: ['seasonal'],
        occupationCodes: [],
        availabilityDate: '2027-06-01',
        skillKeys: [],
        certifications: [],
        workAuthorization: null,
        minPay: null,
        willingToRelocate: false,
        preferredStates: [],
        region: 'CO',
        countryCode: 'US',
      },
    );
    const [h2] = await listingsFake.getHiringInfoMany(t.db, [listingId]);
    if (!h2) throw new Error('no listing');
    expect(await refreshPool(t.db, h2, NOW)).toBe('refreshed');

    const rows = await t.db.select().from(candidatePoolEntries).where(eq(candidatePoolEntries.listingId, listingId));
    const keptRow = rows.find((r) => r.seekerUserId === kept);
    const goneRow = rows.find((r) => r.seekerUserId === gone);
    expect(keptRow?.savedAt).toBeInstanceOf(Date);
    expect(keptRow?.hiddenAt).toBeInstanceOf(Date);
    expect(keptRow?.id).toBe(keptId);
    expect(goneRow).toMatchObject({ eligible: false, state: null, availableFrom: null, skillsNorm: [] });
  });

  it('leaves out applicants, blocked and muted seekers, and keeps invited ones with their status', async () => {
    const h = await host();
    const listingId = listingFor(h);
    const applicant = await seeker();
    const blocked = await seeker();
    const muted = await seeker();
    const invited = await seeker();
    const held = await seeker();
    const lapsed = await seeker();
    await seedEntry(t.db, { orgId: h.orgId, listingId, seekerUserId: applicant });
    safetyFake.setBlocked(h.orgId, blocked);
    safetyFake.setMuted(h.orgId, muted);
    const inviteId = await seedInvite(t.db, { orgId: h.orgId, listingId, seekerUserId: invited, sentBy: h.userId });
    await seedInvite(t.db, { orgId: h.orgId, listingId, seekerUserId: held, sentBy: h.userId, scanState: 'held' });
    await seedInvite(t.db, {
      orgId: h.orgId,
      listingId,
      seekerUserId: lapsed,
      sentBy: h.userId,
      sentAt: new Date(NOW.getTime() - 15 * 24 * HOUR),
      expiresAt: new Date(NOW.getTime() - 24 * HOUR),
    });
    const r = await list(h, listingId);
    expect(new Set(ids(r))).toEqual(new Set([invited, held, lapsed]));
    const by = (id: string) => r.items.find((i) => i.card.seekerUserId === id)?.invite;
    expect(by(invited)).toEqual({ inviteId, status: 'sent' });
    expect(by(held)?.status).toBe('not_delivered');
    expect(by(lapsed)?.status).toBe('expired');
  });

  it('drops someone who became an applicant since the refresh', async () => {
    const h = await host();
    const listingId = listingFor(h);
    const a = await seeker();
    const b = await seeker();
    await list(h, listingId);
    await seedEntry(t.db, { orgId: h.orgId, listingId, seekerUserId: a });
    expect(ids(await list(h, listingId))).toEqual([b]);
  });

  it('refreshes a first page when the run is stale or the revision changed, never with a cursor', async () => {
    const h = await host();
    const listingId = listingFor(h);
    for (let n = 0; n < 30; n += 1) await seeker();
    const first = await list(h, listingId);
    expect(poolQueries()).toBe(1);
    expect(first.items).toHaveLength(24);
    expect(first.nextCursor).not.toBeNull();

    await list(h, listingId);
    expect(poolQueries()).toBe(1);

    await t.db.execute(
      sql`update app.candidate_pool_runs set computed_at = ${new Date(NOW.getTime() - 7 * HOUR)} where listing_id = ${listingId}::uuid`,
    );
    const second = await list(h, listingId, { cursor: first.nextCursor ?? undefined });
    expect(poolQueries()).toBe(1);
    expect(second.items).toHaveLength(6);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...ids(first), ...ids(second)]).size).toBe(30);

    await list(h, listingId);
    expect(poolQueries()).toBe(2);

    const [current] = await listingsFake.getHiringInfoMany(t.db, [listingId]);
    if (!current) throw new Error('no listing');
    listingsFake.setListing({ ...current, publishedRevisionId: newId() });
    await list(h, listingId);
    expect(poolQueries()).toBe(3);
  });

  it('refuses a cursor from another listing or view', async () => {
    const h = await host();
    const listingId = listingFor(h);
    for (let n = 0; n < 25; n += 1) await seeker();
    const first = await list(h, listingId);
    const cursor = first.nextCursor ?? undefined;
    expect(cursor).toBeDefined();
    await expect(list(h, listingId, { cursor, view: 'saved' })).rejects.toMatchObject({
      code: 'bad_request',
    });
    await expect(list(h, listingFor(h), { cursor })).rejects.toMatchObject({
      code: 'bad_request',
    });
  });

  it('never returns names, contacts or a photo (spec failure mode 5)', async () => {
    const h = await host();
    const listingId = listingFor(h);
    const a = await seeker({ card: { avatarMediaId: newId() } });
    await seeker();
    const r = await list(h, listingId);
    const keys = keysDeep(JSON.parse(JSON.stringify(r)));
    for (const banned of ['fullName', 'lastName', 'email', 'phone', 'resumeUrl']) expect(keys.has(banned)).toBe(false);
    for (const item of r.items) {
      expect(item.avatarUrl).toBeNull();
      expect(item.card.avatarMediaId).toBeNull();
    }

    mocks.getCandidateCards.mockImplementation(async (db: never, i: { seekerUserIds: string[] }) =>
      (await profilesFake.getCandidateCards(db, { ...i, orgId: h.orgId, stage: 'pool' })).filter(
        (c) => c.card.seekerUserId !== a,
      ),
    );
    expect(ids(await list(h, listingId))).not.toContain(a);
    expect(mocks.getCandidateCards).toHaveBeenLastCalledWith(expect.anything(), {
      orgId: h.orgId,
      seekerUserIds: expect.any(Array),
      stage: 'pool',
    });
  });

  it('filters by state, available-by and skills', async () => {
    const h = await host();
    const listingId = listingFor(h);
    const co = await seeker({ card: { region: 'CO', availabilityDate: '2027-05-20' } });
    const ut = await seeker({
      card: { region: 'UT', availabilityDate: '2027-07-01', skills: [{ label: 'Lift operations', highlighted: false }] },
    });
    expect(new Set(ids(await list(h, listingId)))).toEqual(new Set([co, ut]));
    expect(ids(await list(h, listingId, { state: 'CO' }))).toEqual([co]);
    expect(ids(await list(h, listingId, { availableBy: '2027-06-01' }))).toEqual([co]);
    expect(ids(await list(h, listingId, { skills: ['customer-service'] }))).toEqual([co]);
    expect(ids(await list(h, listingId, { skills: ['Lift operations'] }))).toEqual([ut]);
  });

  it('lists saved and hidden views, and hides hidden candidates from all', async () => {
    const h = await host();
    const listingId = listingFor(h);
    const a = await seeker();
    const b = await seeker();
    const first = await list(h, listingId);
    const candidate = (id: string) => first.items.find((i) => i.card.seekerUserId === id)?.candidateId ?? '';
    await setCandidateFlag(t.db, h.ctx, candidate(a), 'saved', true);
    await setCandidateFlag(t.db, h.ctx, candidate(b), 'hidden', true);
    expect(ids(await list(h, listingId))).toEqual([a]);
    expect(ids(await list(h, listingId, { view: 'saved' }))).toEqual([a]);
    expect((await list(h, listingId, { view: 'saved' })).items[0]?.saved).toBe(true);
    expect(ids(await list(h, listingId, { view: 'hidden' }))).toEqual([b]);
    await setCandidateFlag(t.db, h.ctx, candidate(b), 'hidden', false);
    expect(new Set(ids(await list(h, listingId)))).toEqual(new Set([a, b]));
  });

  it('refuses pool access until business verification clears (issue 117)', async () => {
    const h = await host();
    const listingId = listingFor(h);
    await seeker();
    mocks.hostApplicantGate.mockResolvedValue({ ok: false, reason: 'needs_review' });
    await expect(list(h, listingId)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'verification_needs_review' },
    });
    expect(poolQueries()).toBe(0);
  });
});

describe('setCandidateFlag', () => {
  it("is 404 for another org's candidate or a listing outside scope", async () => {
    const h = await host();
    const other = await host();
    const listingId = listingFor(h);
    await seeker();
    const [item] = (await list(h, listingId)).items;
    await expect(setCandidateFlag(t.db, other.ctx, item?.candidateId ?? '', 'saved', true)).rejects.toMatchObject({
      code: 'not_found',
    });
    orgsFake.setAccess(h.userId, { all: false, listingIds: [], locationIds: [] });
    await expect(setCandidateFlag(t.db, h.ctx, item?.candidateId ?? '', 'saved', true)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(setCandidateFlag(t.db, h.ctx, newId(), 'saved', true)).rejects.toMatchObject({ code: 'not_found' });
  });
});
