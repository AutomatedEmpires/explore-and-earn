// /api/v1/host/invites and /host/invites/{id}/candidate (SP5 plan Tasks 14 and 15): sending is
// 201 and spends a credit, Billing is 403, and the Interested profile is 404 before an answer.
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HostInviteItem, Page } from '@/lib/hiring';
import { candidatePoolEntries } from '@/db/schema';
import { entitlementsFake, listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { profilesFake, safetyFake } from '@tests/fakes/sp5/sp4';
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
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
}));

import { GET, POST } from './route';
import { GET as CANDIDATE } from './[id]/candidate/route';

const t = setupRouteDb();

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
  entitlementsFake.reset();
  profilesFake.reset();
  safetyFake.reset();
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
      skills: [],
      avatarMediaId: null,
      coverMediaId: null,
      categories: ['seasonal'],
    },
    {
      seekerUserId: userId,
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
    },
  );
  const candidateId = newId();
  await t.db.insert(candidatePoolEntries).values({
    id: candidateId,
    listingId,
    orgId: org.orgId,
    seekerUserId: userId,
    eligible: true,
    computedAt: new Date(),
  });
  entitlementsFake.setCredits(org.orgId, 3);
  return { org, listingId, candidateId, seekerUserId: userId };
}

describe('/api/v1/host/invites', () => {
  it('sends an invite with 201, spends a credit and lists it', async () => {
    const { org, candidateId } = await setup();
    asHost(org.owner.ctx);
    const sent = await call(POST, request('POST', '/api/v1/host/invites', { body: { candidateId } }));
    expect(sent.status).toBe(201);
    const invite = (sent.body as { invite: HostInviteItem }).invite;
    expect(invite).toMatchObject({ candidateId, status: 'sent' });
    expect((await entitlementsFake.getBalance(t.db, org.orgId, 'invite_credit')).balance).toBe(2);

    const list = await call(GET, request('GET', '/api/v1/host/invites'));
    expect(list.status).toBe(200);
    expect((list.body as Page<HostInviteItem>).items.map((i) => i.inviteId)).toEqual([invite.inviteId]);

    const again = await call(POST, request('POST', '/api/v1/host/invites', { body: { candidateId } }));
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: { code: 'conflict', details: { reason: 'already_invited' } } });
  });

  it('refuses a 301-character note with 400 and spends nothing', async () => {
    const { org, candidateId } = await setup();
    asHost(org.owner.ctx);
    const res = await call(
      POST,
      request('POST', '/api/v1/host/invites', { body: { candidateId, note: 'x'.repeat(301) } }),
    );
    expect(res.status).toBe(400);
    expect((await entitlementsFake.getBalance(t.db, org.orgId, 'invite_credit')).balance).toBe(3);
  });

  it('refuses Billing with 403 on every invite route', async () => {
    const { org, candidateId } = await setup();
    const billing = await seedMember(t.db, org.orgId, 'billing');
    orgsFake.setAccess(billing.userId, { all: true });
    asHost(billing.ctx);
    expect((await call(GET, request('GET', '/api/v1/host/invites'))).status).toBe(403);
    expect((await call(POST, request('POST', '/api/v1/host/invites', { body: { candidateId } }))).status).toBe(403);
    const id = newId();
    expect((await call(CANDIDATE, request('GET', `/api/v1/host/invites/${id}/candidate`), { id })).status).toBe(403);
  });

  it('answers 404 for the Interested profile of an unanswered invite', async () => {
    const { org, candidateId } = await setup();
    asHost(org.owner.ctx);
    const sent = await call(POST, request('POST', '/api/v1/host/invites', { body: { candidateId } }));
    const { inviteId } = (sent.body as { invite: HostInviteItem }).invite;
    const res = await call(CANDIDATE, request('GET', `/api/v1/host/invites/${inviteId}/candidate`), { id: inviteId });
    expect(res.status).toBe(404);
    const rows = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.invites where id = ${inviteId}::uuid`,
    );
    expect(rows[0]?.n).toBe(1);
  });
});
