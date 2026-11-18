// GET /api/v1/host/listings/{id}/candidates and PUT/DELETE /host/candidates/{id}/save|hide
// (SP5 plan Task 13): Billing is 403, a Recruiter outside the listing's scope is 404, and a
// saved candidate shows in the saved view.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import type { PoolCardData } from '@/lib/hiring';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { profilesFake } from '@tests/fakes/sp5/sp4';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedHostOrg, seedMember, seedSeeker } from '@tests/helpers/sp5';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
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
}));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  ...(await import('@tests/fakes/sp5/sp4')).profilesFake,
}));
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));
vi.mock('@/modules/discovery', async (orig) => ({
  ...(await orig<typeof import('@/modules/discovery')>()),
  ...(await import('@tests/fakes/sp5/sp3')).discoveryFake,
}));

import { GET } from './route';
import { DELETE as UNSAVE, PUT as SAVE } from '../../../candidates/[candidateId]/save/route';
import { PUT as HIDE } from '../../../candidates/[candidateId]/hide/route';

const t = setupRouteDb();

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
  profilesFake.reset();
});

async function setup() {
  const org = await seedHostOrg(t.db);
  orgsFake.setAccess(org.owner.userId, { all: true });
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, publishedRevisionId: newId() });
  const { userId } = await seedSeeker(t.db);
  profilesFake.setPoolSeeker(
    {
      seekerUserId: userId,
      firstName: 'Maya',
      lastInitial: 'R',
      city: 'Denver',
      region: 'CO',
      countryCode: 'US',
      availabilityDate: '2026-12-01',
      skills: [{ label: 'Customer service', highlighted: true }],
      avatarMediaId: null,
      coverMediaId: null,
      categories: ['seasonal'],
    },
    {
      seekerUserId: userId,
      categories: ['seasonal'],
      occupationCodes: [],
      availabilityDate: '2026-12-01',
      skillKeys: ['customer-service'],
      certifications: [],
      workAuthorization: { status: 'authorized' },
      minPay: null,
      willingToRelocate: false,
      preferredStates: [],
      region: 'CO',
      countryCode: 'US',
    },
  );
  return { org, listingId, seekerUserId: userId };
}

const path = (listingId: string) => `/api/v1/host/listings/${listingId}/candidates`;

describe('GET /api/v1/host/listings/{id}/candidates', () => {
  it('lists the pool for the owner, with one skills filter as a plain query value', async () => {
    const { org, listingId, seekerUserId } = await setup();
    asHost(org.owner.ctx);
    const res = await call(GET, request('GET', path(listingId)), { id: listingId });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = res.body as { items: PoolCardData[]; fitAvailable: boolean };
    expect(body.items.map((i) => i.card.seekerUserId)).toEqual([seekerUserId]);
    const filtered = await call(
      GET,
      request('GET', path(listingId), { query: { skills: 'customer-service' } }),
      { id: listingId },
    );
    expect(filtered.status).toBe(200);
    expect((filtered.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('refuses Billing with 403', async () => {
    const { org, listingId } = await setup();
    const billing = await seedMember(t.db, org.orgId, 'billing');
    orgsFake.setAccess(billing.userId, { all: true });
    asHost(billing.ctx);
    const res = await call(GET, request('GET', path(listingId)), { id: listingId });
    expect(res.status).toBe(403);
  });

  it('answers 404 to a Recruiter outside the listing scope', async () => {
    const { org, listingId } = await setup();
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    orgsFake.setAccess(recruiter.userId, { all: false, listingIds: [], locationIds: [] });
    asHost(recruiter.ctx);
    const res = await call(GET, request('GET', path(listingId)), { id: listingId });
    expect(res.status).toBe(404);
  });

  it('saves, hides and unsaves a candidate', async () => {
    const { org, listingId } = await setup();
    asHost(org.owner.ctx);
    const first = await call(GET, request('GET', path(listingId)), { id: listingId });
    const candidateId = (first.body as { items: PoolCardData[] }).items[0]?.candidateId ?? '';

    const saved = await call(SAVE, request('PUT', `/api/v1/host/candidates/${candidateId}/save`), { candidateId });
    expect(saved).toMatchObject({ status: 200, body: { ok: true } });
    const view = await call(GET, request('GET', path(listingId), { query: { view: 'saved' } }), { id: listingId });
    expect((view.body as { items: PoolCardData[] }).items.map((i) => i.candidateId)).toEqual([candidateId]);

    await call(UNSAVE, request('DELETE', `/api/v1/host/candidates/${candidateId}/save`), { candidateId });
    const none = await call(GET, request('GET', path(listingId), { query: { view: 'saved' } }), { id: listingId });
    expect((none.body as { items: unknown[] }).items).toEqual([]);

    const hidden = await call(HIDE, request('PUT', `/api/v1/host/candidates/${candidateId}/hide`), { candidateId });
    expect(hidden.status).toBe(200);
    const all = await call(GET, request('GET', path(listingId)), { id: listingId });
    expect((all.body as { items: unknown[] }).items).toEqual([]);
  });

  it("answers 404 to another org's candidate", async () => {
    const { org, listingId } = await setup();
    asHost(org.owner.ctx);
    const first = await call(GET, request('GET', path(listingId)), { id: listingId });
    const candidateId = (first.body as { items: PoolCardData[] }).items[0]?.candidateId ?? '';
    const other = await seedHostOrg(t.db);
    orgsFake.setAccess(other.owner.userId, { all: true });
    asHost(other.owner.ctx);
    const res = await call(SAVE, request('PUT', `/api/v1/host/candidates/${candidateId}/save`), { candidateId });
    expect(res.status).toBe(404);
  });
});
