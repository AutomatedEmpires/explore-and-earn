// /api/v1/me/invites/** (SP5 plan Task 15): a seeker lists, reads, answers and mutes their own
// delivered invites; anyone else's is 404 and an invalid answer is 400.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import type { Page, SeekerInviteItem } from '@/lib/hiring';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { profilesFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { asSeeker, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedHostOrg, seedInvite, seedSeeker } from '@tests/helpers/sp5';

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
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
}));

import { GET as LIST } from './route';
import { GET as DETAIL } from './[id]/route';
import { POST as MUTE } from './[id]/mute/route';
import { POST as RESPOND } from './[id]/respond/route';

const t = setupRouteDb();

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
  profilesFake.reset();
  safetyFake.reset();
  messagingFake.reset();
});

async function setup() {
  const org = await seedHostOrg(t.db);
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge Lodge');
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId });
  const seeker = await seedSeeker(t.db);
  const inviteId = await seedInvite(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    sentBy: org.owner.userId,
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
  });
  return { org, listingId, seeker, inviteId };
}

describe('/api/v1/me/invites', () => {
  it('lists and reads the seeker own invite', async () => {
    const { seeker, inviteId } = await setup();
    asSeeker(seeker.user);
    const list = await call(LIST, request('GET', '/api/v1/me/invites'));
    expect(list.status).toBe(200);
    expect((list.body as Page<SeekerInviteItem>).items.map((i) => i.inviteId)).toEqual([inviteId]);
    const detail = await call(DETAIL, request('GET', `/api/v1/me/invites/${inviteId}`), { id: inviteId });
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ invite: { inviteId, orgName: 'Kettle Ridge Lodge' }, jobCard: null });
  });

  it('answers Interested with a thread', async () => {
    const { seeker, inviteId } = await setup();
    asSeeker(seeker.user);
    const res = await call(
      RESPOND,
      request('POST', `/api/v1/me/invites/${inviteId}/respond`, { body: { response: 'interested' } }),
      { id: inviteId },
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ invite: { status: 'interested' }, threadId: expect.any(String) });
  });

  it('refuses a reason with Interested as 400', async () => {
    const { seeker, inviteId } = await setup();
    asSeeker(seeker.user);
    const res = await call(
      RESPOND,
      request('POST', `/api/v1/me/invites/${inviteId}/respond`, { body: { response: 'interested', reason: 'pay' } }),
      { id: inviteId },
    );
    expect(res.status).toBe(400);
  });

  it('mutes the host', async () => {
    const { seeker, inviteId } = await setup();
    asSeeker(seeker.user);
    const res = await call(MUTE, request('POST', `/api/v1/me/invites/${inviteId}/mute`), { id: inviteId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ invite: { status: 'not_interested' } });
  });

  it("answers 404 for another seeker's invite on every route", async () => {
    const { inviteId } = await setup();
    const other = await seedSeeker(t.db);
    asSeeker(other.user);
    expect((await call(DETAIL, request('GET', `/api/v1/me/invites/${inviteId}`), { id: inviteId })).status).toBe(404);
    const respond = await call(
      RESPOND,
      request('POST', `/api/v1/me/invites/${inviteId}/respond`, { body: { response: 'interested' } }),
      { id: inviteId },
    );
    expect(respond.status).toBe(404);
    expect((await call(MUTE, request('POST', `/api/v1/me/invites/${inviteId}/mute`), { id: inviteId })).status).toBe(404);
    const list = await call(LIST, request('GET', '/api/v1/me/invites'));
    expect((list.body as Page<SeekerInviteItem>).items).toEqual([]);
  });
});
