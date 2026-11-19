// Fit scoring and the legal switches (SP5 plan Task 13, spec 8.3, E3): `hiring.fit_enabled`
// turns fit off everywhere, and `hiring.fit_disabled_states` turns it off for listings located
// in those states. Off means no score is computed or stored.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FitInputs, PoolCard } from '@/lib/profiles';
import { newId } from '@/lib/ids';
import { setSetting } from '@/modules/settings';
import { pipelineEntries } from '../schema';
import { listingsFake } from '@tests/fakes/sp5/sp2';
import { profilesFake } from '@tests/fakes/sp5/sp4';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry } from '@tests/helpers/sp5';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
  listOccupations: async () => [
    { code: 'lift_operator', label: 'Lift operator', socCode: '53-7099', categories: ['seasonal'] },
  ],
}));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  ...(await import('@tests/fakes/sp5/sp4')).profilesFake,
}));
vi.mock('@/modules/discovery', async (orig) => ({
  ...(await orig<typeof import('@/modules/discovery')>()),
  ...(await import('@tests/fakes/sp5/sp3')).discoveryFake,
}));

import { refreshFit, scoreApplications } from '../fit-store';
import { fitAvailable, scoreSeekers, seekersInDisabledStates } from './score';
import { FIT_WEIGHTS_VERSION } from './weights';

const OPERATOR = { operatorId: '019a4a3c-0000-7000-8000-00000000f001' };

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  listingsFake.reset();
  profilesFake.reset();
  await setSetting(t.db, 'hiring.fit_enabled', true, OPERATOR);
  await setSetting(t.db, 'hiring.fit_disabled_states', [], OPERATOR);
});

function poolSeeker(userId: string, over: Partial<FitInputs> = {}): void {
  const card: PoolCard = {
    seekerUserId: userId,
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
  profilesFake.setPoolSeeker(card, {
    seekerUserId: userId,
    categories: ['seasonal'],
    occupationCodes: ['lift_operator'],
    availabilityDate: '2026-12-01',
    skillKeys: [],
    certifications: [],
    workAuthorization: { status: 'authorized' },
    minPay: { cents: 1800, unit: 'hour' },
    willingToRelocate: false,
    preferredStates: ['CO'],
    region: 'CO',
    countryCode: 'US',
    ...over,
  });
}

function onSite(state: string | null = 'CO') {
  const id = newId();
  const orgId = newId();
  listingsFake.setListing({ id, orgId, state, occupation: 'lift_operator', startDate: '2026-12-01' });
  return { id, orgId };
}

async function info(id: string) {
  const [h] = await listingsFake.getHiringInfoMany(t.db, [id]);
  if (!h) throw new Error('no listing');
  return h;
}

describe('fitAvailable', () => {
  it('is on by default', async () => {
    expect(await fitAvailable(t.db, await info(onSite().id))).toBe(true);
  });

  it('is off everywhere when hiring.fit_enabled is false', async () => {
    await setSetting(t.db, 'hiring.fit_enabled', false, OPERATOR);
    expect(await fitAvailable(t.db, await info(onSite().id))).toBe(false);
  });

  it("is off for an on-site listing in a disabled state, and on elsewhere", async () => {
    await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
    expect(await fitAvailable(t.db, await info(onSite('CO').id))).toBe(false);
    expect(await fitAvailable(t.db, await info(onSite('UT').id))).toBe(true);
  });

  it('is off for a Remote listing that hires from a disabled state', async () => {
    await setSetting(t.db, 'hiring.fit_disabled_states', ['NY'], OPERATOR);
    const remote = newId();
    listingsFake.setListing({ id: remote, orgId: newId(), category: 'remote', state: null, remoteStates: ['CO', 'NY'] });
    expect(await fitAvailable(t.db, await info(remote))).toBe(false);
    const allUs = newId();
    listingsFake.setListing({ id: allUs, orgId: newId(), category: 'remote', state: null, remoteStates: 'all_us' });
    expect(await fitAvailable(t.db, await info(allUs))).toBe(false);
    const elsewhere = newId();
    listingsFake.setListing({ id: elsewhere, orgId: newId(), category: 'remote', state: null, remoteStates: ['CO', 'UT'] });
    expect(await fitAvailable(t.db, await info(elsewhere))).toBe(true);
  });

  it('keeps an all-US Remote listing on while no state is disabled', async () => {
    const allUs = newId();
    listingsFake.setListing({ id: allUs, orgId: newId(), category: 'remote', state: null, remoteStates: 'all_us' });
    expect(await fitAvailable(t.db, await info(allUs))).toBe(true);
  });
});

describe('scoreSeekers', () => {
  it('scores from FitInputs with the occupation label and the hourly pay', async () => {
    const listing = onSite('CO');
    const seeker = newId();
    poolSeeker(seeker);
    const scores = await scoreSeekers(t.db, await info(listing.id), [seeker], '2026-11-03');
    const result = scores?.get(seeker);
    expect(result?.weightsVersion).toBe(FIT_WEIGHTS_VERSION);
    expect(result?.lines.map((l) => l.text)).toEqual([
      'Interested in Lift operator',
      'Available for your full dates',
      'Authorized to work in the US (self-reported)',
      'Pay meets their expectations',
      'Prefers jobs in Colorado',
    ]);
    expect(result?.score).toBe(100);
  });

  it('returns null when fit is off for the listing (E3)', async () => {
    await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
    const listing = onSite('CO');
    const seeker = newId();
    poolSeeker(seeker);
    expect(await scoreSeekers(t.db, await info(listing.id), [seeker])).toBeNull();
  });

  // Lead decision 2026-11-18 (issue 198), pending counsel under SP5 open item 2.
  it('leaves out a seeker who lives in a disabled state, wherever the listing is', async () => {
    await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
    const listing = onSite('UT');
    expect(await fitAvailable(t.db, await info(listing.id))).toBe(true);
    const coloradan = newId();
    const lowerCase = newId();
    const utahn = newId();
    poolSeeker(coloradan, { region: 'CO' });
    poolSeeker(lowerCase, { region: 'co', countryCode: 'us' });
    poolSeeker(utahn, { region: 'UT' });
    const scores = await scoreSeekers(t.db, await info(listing.id), [coloradan, lowerCase, utahn], '2026-11-03');
    expect(scores && [...scores.keys()]).toEqual([utahn]);

    const remote = newId();
    listingsFake.setListing({ id: remote, orgId: newId(), category: 'remote', state: null, remoteStates: ['UT', 'NV'] });
    const remoteScores = await scoreSeekers(t.db, await info(remote), [coloradan, utahn], '2026-11-03');
    expect(remoteScores && [...remoteScores.keys()]).toEqual([utahn]);
  });

  it('applies only the listing rule to a seeker with no US home state', async () => {
    await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
    const listing = onSite('UT');
    const noState = newId();
    const abroad = newId();
    poolSeeker(noState, { region: null });
    poolSeeker(abroad, { region: 'CO', countryCode: 'MX' });
    const scores = await scoreSeekers(t.db, await info(listing.id), [noState, abroad], '2026-11-03');
    expect(scores && [...scores.keys()].sort()).toEqual([noState, abroad].sort());

    // The listing rule still turns fit off for everyone on a listing in a disabled state.
    expect(await scoreSeekers(t.db, await info(onSite('CO').id), [noState, abroad])).toBeNull();
  });

  it('scores a Coloradan while Colorado is not disabled', async () => {
    const listing = onSite('UT');
    const coloradan = newId();
    poolSeeker(coloradan, { region: 'CO' });
    expect((await scoreSeekers(t.db, await info(listing.id), [coloradan], '2026-11-03'))?.has(coloradan)).toBe(true);
  });
});

describe('seekersInDisabledStates', () => {
  it('names the seekers who live in a disabled state and reads nothing while none is', async () => {
    const coloradan = newId();
    const utahn = newId();
    const unknown = newId();
    poolSeeker(coloradan, { region: 'CO' });
    poolSeeker(utahn, { region: 'UT' });
    expect(await seekersInDisabledStates(t.db, [coloradan, utahn, unknown], [])).toEqual(new Set());
    expect(profilesFake.calls.filter((c) => c.name === 'getFitInputs')).toEqual([]);
    expect(await seekersInDisabledStates(t.db, [coloradan, utahn, unknown], ['CO', 'NY'])).toEqual(
      new Set([coloradan]),
    );
  });
});

describe('scoreApplications', () => {
  async function entry(listing: { id: string; orgId: string }, seekerUserId: string, status: 'new' | 'hired' = 'new') {
    return seedEntry(t.db, { orgId: listing.orgId, listingId: listing.id, seekerUserId, status, fitScore: 12 });
  }

  async function row(applicationId: string) {
    const [r] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    return r;
  }

  it('stores the score, lines, weights version and time for non-terminal entries', async () => {
    const listing = onSite('CO');
    const seeker = newId();
    poolSeeker(seeker);
    const open = await entry(listing, seeker);
    const hired = await entry(listing, newId(), 'hired');
    expect(await scoreApplications(t.db, { listingId: listing.id })).toBe(1);
    const scored = await row(open);
    expect(scored?.fitScore).toBe(100);
    expect(scored?.fitWeightsVersion).toBe(FIT_WEIGHTS_VERSION);
    expect(Array.isArray(scored?.fitLines)).toBe(true);
    expect(scored?.fitComputedAt).toBeInstanceOf(Date);
    expect((await row(hired))?.fitScore).toBe(12);
  });

  it('scores only the given applications', async () => {
    const listing = onSite('CO');
    const a = newId();
    const b = newId();
    poolSeeker(a);
    poolSeeker(b);
    const first = await entry(listing, a);
    const second = await entry(listing, b);
    expect(await scoreApplications(t.db, { listingId: listing.id, applicationIds: [first] })).toBe(1);
    expect((await row(first))?.fitScore).toBe(100);
    expect((await row(second))?.fitScore).toBe(12);
  });

  it('nulls the score when fit is off for the listing (E3)', async () => {
    await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
    const listing = onSite('CO');
    const seeker = newId();
    poolSeeker(seeker);
    const open = await entry(listing, seeker);
    expect(await scoreApplications(t.db, { listingId: listing.id })).toBe(0);
    const cleared = await row(open);
    expect(cleared?.fitScore).toBeNull();
    expect(cleared?.fitLines).toBeNull();
    expect(cleared?.fitWeightsVersion).toBeNull();
  });

  it('nulls the score of an applicant who lives in a disabled state, on a listing elsewhere', async () => {
    const listing = onSite('UT');
    const coloradan = newId();
    const utahn = newId();
    poolSeeker(coloradan, { region: 'CO' });
    poolSeeker(utahn, { region: 'UT' });
    const fromColorado = await entry(listing, coloradan);
    const fromUtah = await entry(listing, utahn);
    expect(await scoreApplications(t.db, { listingId: listing.id })).toBe(2);
    await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
    expect(await scoreApplications(t.db, { listingId: listing.id })).toBe(1);
    expect(await row(fromColorado)).toMatchObject({ fitScore: null, fitLines: null, fitWeightsVersion: null });
    expect((await row(fromUtah))?.fitScore).toBeGreaterThan(0);
  });

  it('nulls every score when hiring.fit_enabled is false', async () => {
    await setSetting(t.db, 'hiring.fit_enabled', false, OPERATOR);
    const listing = onSite('UT');
    const seeker = newId();
    poolSeeker(seeker);
    const open = await entry(listing, seeker);
    await scoreApplications(t.db, { listingId: listing.id });
    expect((await row(open))?.fitScore).toBeNull();
  });
});

describe('refreshFit', () => {
  it('rescores entries on active listings only', async () => {
    const active = onSite('CO');
    const closed = newId();
    listingsFake.setListing({ id: closed, orgId: active.orgId, status: 'closed', state: 'CO' });
    const seeker = newId();
    poolSeeker(seeker);
    const onActive = await seedEntry(t.db, { orgId: active.orgId, listingId: active.id, seekerUserId: seeker, fitScore: 5 });
    const onClosed = await seedEntry(t.db, { orgId: active.orgId, listingId: closed, seekerUserId: seeker, fitScore: 5 });
    expect(await refreshFit(t.db, new Date('2026-11-03T08:00:00Z'))).toBeGreaterThanOrEqual(1);
    const [a] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, onActive));
    const [c] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, onClosed));
    expect(a?.fitScore).toBe(100);
    expect(c?.fitScore).toBe(5);
  });
});
