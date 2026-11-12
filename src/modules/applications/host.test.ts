// Host reads and their authorization (SP4 spec 3.2 and 10, plan Task 23): role, org and listing
// scope, the audit row, and what a host may and may not see about work authorization.
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/v1/host/applications/[id]/route';
import { queryRows } from '@/lib/db';
import { resetSp2, setListingAccess, setListingState } from '@tests/fakes/sp4/sp2';
import {
  asHost,
  call,
  request,
  seedMember,
  seedOrg,
  seedUser,
  setupRouteDb,
} from '@tests/helpers/sp4';
import { authorizeHostApplication, getHostApplication, getHostCards, getSnapshot } from './host';
import { setAdditionalStep, setStatus, withdraw } from './status';
import { submitApplication } from './submit';
import {
  auditActions,
  deckhand,
  input,
  rejection,
  resetMocks,
  safety,
  seedWorld,
  setProfile,
  type World,
} from './test-fixtures';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp4/sp2')).orgsAdditions,
}));
vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);
vi.mock('@/modules/locations', async () => (await import('@tests/fakes/sp4/sp2')).locationsModule);
// Spread over the real modules: the route loads every module's registrations.
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  ...(await import('./test-fixtures')).profilesMock(),
}));
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('./test-fixtures')).safetyMock(),
}));
vi.mock('@/modules/notifications', async (orig) => ({
  ...(await orig<typeof import('@/modules/notifications')>()),
  notify: vi.fn(async () => {}),
}));

const t = setupRouteDb();
let w: World;
let id: string;
let listingId: string;

beforeEach(async () => {
  resetSp2();
  resetMocks();
  w = await seedWorld(t.db);
  const l = deckhand(w, {
    additionalStep: { url: 'https://kettle.test/form', note: 'Fill it in' },
  });
  listingId = l.listingId;
  id = (await submitApplication(t.db, w.seeker.id, input(l))).application.applicationId;
});

/** A second org with its own Owner, to probe the boundary between hosts. */
async function otherOrg() {
  const { orgId } = await seedOrg(t.db, { name: 'Other Lodge' });
  return seedMember(t.db, orgId, await seedUser(t.db, { accountType: 'host' }), 'owner');
}

/** The snapshot_viewed audit rows of one org (the file's tests share a database). */
const viewsOf = async (orgId: string) =>
  (await auditActions(t.db, 'applications.snapshot_viewed')).filter((a) => a.orgId === orgId);

const CARD_KEYS = [
  'additionalStepCompletedAt',
  'applicationId',
  'availabilityDate',
  'avatarMediaId',
  'city',
  'coverMediaId',
  'firstName',
  'lastName',
  'listingId',
  'region',
  'skills',
  'source',
  'status',
  'submittedAt',
];

describe('authorizeHostApplication', () => {
  it.each(['owner', 'admin', 'recruiter'] as const)('lets a %s in', async (role) => {
    const ref = await authorizeHostApplication(t.db, w[role], id);
    expect(ref).toMatchObject({
      applicationId: id,
      listingId,
      orgId: w.orgId,
      seekerUserId: w.seeker.id,
      status: 'new',
    });
    expect(ref.submittedAt).toBeInstanceOf(Date);
  });

  it('forbids a Billing member with role_not_allowed', async () => {
    const err = await rejection(authorizeHostApplication(t.db, w.billing, id));
    expect(err.status).toBe(403);
    expect(err.details).toEqual({ reason: 'role_not_allowed' });
  });

  it("is not found for another org's application, the same as an unknown id (no IDOR)", async () => {
    const outsider = await otherOrg();
    const theirs = await rejection(authorizeHostApplication(t.db, outsider, id));
    const unknown = await rejection(
      authorizeHostApplication(t.db, outsider, '019a4a3c-0000-7000-8000-0000000f0030'),
    );
    expect(theirs.status).toBe(404);
    expect({ code: theirs.code, message: theirs.message, details: theirs.details }).toEqual({
      code: unknown.code,
      message: unknown.message,
      details: unknown.details,
    });
    expect((await rejection(authorizeHostApplication(t.db, outsider, 'not-a-uuid'))).status).toBe(
      404,
    );
  });

  it('is not found for a Recruiter scoped to other listings', async () => {
    setListingAccess((ctx) => ctx.role !== 'recruiter');
    expect((await rejection(authorizeHostApplication(t.db, w.recruiter, id))).status).toBe(404);
    await expect(authorizeHostApplication(t.db, w.admin, id)).resolves.toBeDefined();
  });

  it('is not found once the seeker blocked the org, and never says why', async () => {
    safety.isBlockedBetween.mockResolvedValue({ blocked: true, byA: true, byB: false });
    const err = await rejection(authorizeHostApplication(t.db, w.owner, id));
    expect(err.status).toBe(404);
    expect(JSON.stringify({ m: err.message, d: err.details })).not.toMatch(/block/i);
  });

  it('still shows the application after the org blocked the seeker', async () => {
    safety.isBlockedBetween.mockResolvedValue({ blocked: true, byA: false, byB: true });
    await expect(authorizeHostApplication(t.db, w.owner, id)).resolves.toBeDefined();
  });

  it('still shows the application after its listing closed', async () => {
    setListingState(listingId, 'closed');
    await expect(authorizeHostApplication(t.db, w.owner, id)).resolves.toBeDefined();
  });
});

describe('getHostApplication', () => {
  it('returns the snapshot, status, tick and full history', async () => {
    await setStatus(t.db, {
      applicationId: id,
      from: ['new'],
      to: 'shortlisted',
      actor: { type: 'host', userId: w.owner.user.id, orgId: w.orgId },
    });
    await setAdditionalStep(t.db, {
      applicationId: id,
      seekerUserId: w.seeker.id,
      completed: true,
    });
    const dto = await getHostApplication(t.db, w.owner, id);
    expect(dto).toMatchObject({
      applicationId: id,
      listingId,
      status: 'shortlisted',
      source: 'seek',
    });
    expect(dto.snapshot.profile.firstName).toBe('Maya');
    expect(dto.additionalStepCompletedAt).not.toBeNull();
    // The host sees the internal move the seeker's receipt hides.
    expect(dto.events.map((e) => [e.type, e.fromStatus, e.toStatus, e.actorType])).toEqual([
      ['submitted', null, 'new', 'seeker'],
      ['status_changed', 'new', 'shortlisted', 'host'],
      ['additional_step_changed', 'shortlisted', 'shortlisted', 'seeker'],
    ]);
  });

  it('writes one applications.snapshot_viewed audit row with the org (E8 route)', async () => {
    asHost(w.recruiter);
    const res = await call(GET, request('GET', `/api/v1/host/applications/${id}`), { id });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.body).toMatchObject({ applicationId: id, status: 'new' });
    expect(await viewsOf(w.orgId)).toEqual([{ orgId: w.orgId, actorId: w.recruiter.user.id }]);
  });

  it('answers 403 to Billing and 404 to another org over HTTP, and audits neither', async () => {
    asHost(w.billing);
    const billing = await call(GET, request('GET', `/api/v1/host/applications/${id}`), { id });
    expect(billing.status).toBe(403);
    expect(billing.body).toMatchObject({
      error: { code: 'forbidden', details: { reason: 'role_not_allowed' } },
    });

    const other = await otherOrg();
    asHost(other);
    const outsider = await call(GET, request('GET', `/api/v1/host/applications/${id}`), { id });
    expect(outsider.status).toBe(404);
    expect(JSON.stringify(outsider.body)).not.toContain('Maya');
    expect(await viewsOf(w.orgId)).toEqual([]);
    expect(await viewsOf(other.orgId)).toEqual([]);
  });

  it('rejects a malformed id with 400 before any read', async () => {
    asHost(w.owner);
    const res = await call(GET, request('GET', '/api/v1/host/applications/abc'), { id: 'abc' });
    expect(res.status).toBe(400);
  });
});

describe('getHostCards', () => {
  it('has exactly the 14 HostApplicationCard keys (E8)', async () => {
    const [card] = await getHostCards(t.db, { orgId: w.orgId, applicationIds: [id] });
    expect(Object.keys(card ?? {}).sort()).toEqual(CARD_KEYS);
    expect(card).toMatchObject({
      applicationId: id,
      listingId,
      status: 'new',
      source: 'seek',
      firstName: 'Maya',
      lastName: 'Rodriguez',
      city: 'Juneau',
      region: 'AK',
      avatarMediaId: null,
      coverMediaId: null,
      availabilityDate: '2027-05-01',
      additionalStepCompletedAt: null,
    });
    expect(card?.skills[0]).toEqual({ label: 'Line handling', highlighted: true });
    expect(card?.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('carries nothing a host could filter on by a protected trait or a visa', async () => {
    setProfile({ workAuthorization: { status: 'has_visa', visaType: 'j1', endsOn: '2027-09-30' } });
    const l = deckhand(w);
    const other = await seedUser(t.db, { accountType: 'seeker' });
    const second = (await submitApplication(t.db, other.id, input(l))).application.applicationId;
    const [card] = await getHostCards(t.db, { orgId: w.orgId, applicationIds: [second] });
    const keys = Object.keys(card ?? {})
      .join(' ')
      .toLowerCase();
    for (const banned of ['authorization', 'visa', 'birth', 'age', 'gender', 'email', 'phone']) {
      expect(keys).not.toContain(banned);
    }
    expect(JSON.stringify(card)).not.toContain('j1');
    expect(JSON.stringify(card)).not.toContain('2027-09-30');
  });

  it("returns the org's cards in the order asked, and never another org's", async () => {
    const l = deckhand(w);
    const other = await seedUser(t.db, { accountType: 'seeker' });
    const second = (await submitApplication(t.db, other.id, input(l))).application.applicationId;
    const cards = await getHostCards(t.db, {
      orgId: w.orgId,
      applicationIds: [second, id, 'junk'],
    });
    expect(cards.map((c) => c.applicationId)).toEqual([second, id]);

    const outsider = await otherOrg();
    expect(
      await getHostCards(t.db, { orgId: outsider.orgId, applicationIds: [id, second] }),
    ).toEqual([]);
    expect(await getHostCards(t.db, { orgId: w.orgId, applicationIds: [] })).toEqual([]);
  });

  it('shows the tick once the seeker completes the Additional step', async () => {
    await setAdditionalStep(t.db, {
      applicationId: id,
      seekerUserId: w.seeker.id,
      completed: true,
    });
    const [card] = await getHostCards(t.db, { orgId: w.orgId, applicationIds: [id] });
    expect(card?.additionalStepCompletedAt).toMatch(/Z$/);
  });
});

describe('getSnapshot', () => {
  it("returns the org's snapshot, and null for another org", async () => {
    expect((await getSnapshot(t.db, { orgId: w.orgId, applicationId: id }))?.listing.title).toBe(
      'Deckhand',
    );
    const outsider = await otherOrg();
    expect(await getSnapshot(t.db, { orgId: outsider.orgId, applicationId: id })).toBeNull();
    expect(await getSnapshot(t.db, { orgId: w.orgId, applicationId: 'junk' })).toBeNull();
  });
});

// Legal review 2.2 item 4 and P0 item 12: a host payload cannot carry a visa type or end date.
describe('work authorization in host reads', () => {
  it('reduces a snapshot stored with the full value to the two answers', async () => {
    // A record frozen before the reduction existed (or written by another path).
    await t.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
      await tx.execute(sql`
        update app.applications
        set snapshot = jsonb_set(snapshot, '{profile,workAuthorization}',
          '{"status":"has_visa","visaType":"h2b","endsOn":"2027-09-30"}'::jsonb)
        where id = ${id}::uuid`);
    });
    const [stored] = await queryRows<{ wa: string }>(
      t.db,
      sql`select snapshot->'profile'->>'workAuthorization' as wa from app.applications
          where id = ${id}::uuid`,
    );
    expect(stored?.wa).toContain('h2b');

    const dto = await getHostApplication(t.db, w.owner, id);
    const snapshot = await getSnapshot(t.db, { orgId: w.orgId, applicationId: id });
    for (const payload of [dto, snapshot]) {
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain('h2b');
      expect(serialized).not.toContain('2027-09-30');
      expect(serialized).not.toContain('has_visa');
    }
    expect(dto.snapshot.profile.workAuthorization).toEqual({ status: 'authorized' });
  });

  it('tells a host that sponsorship is needed, not which visa', async () => {
    setProfile({ workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2a', 'j1'] } });
    const l = deckhand(w, { visaSponsorship: 'h2a' });
    const other = await seedUser(t.db, { accountType: 'seeker' });
    const second = (await submitApplication(t.db, other.id, input(l))).application.applicationId;
    const dto = await getHostApplication(t.db, w.owner, second);
    expect(dto.snapshot.profile.workAuthorization).toEqual({
      status: 'needs_sponsorship',
      visaTypes: ['other'],
    });
  });
});

describe('a withdrawn application', () => {
  it('stays readable to the host, with the withdrawal in its history', async () => {
    await withdraw(t.db, { applicationId: id, seekerUserId: w.seeker.id, reason: 'dates_changed' });
    const dto = await getHostApplication(t.db, w.owner, id);
    expect(dto.status).toBe('withdrawn');
    expect(dto.events.at(-1)).toMatchObject({ type: 'withdrawn', actorType: 'seeker' });
  });
});
