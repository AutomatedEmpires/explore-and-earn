// The seeker's block routes over HTTP (SP4 spec 5 and 8.7, plan Task 26): block a host or a
// person (optionally withdrawing open applications to the host), list who you blocked, and
// unblock. A seeker only ever sees the blocks they made, never a host's block of them.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/modules/identity';
import { kickWorker } from '@/modules/jobs';
import { block, isBlockedBetween } from '@/modules/safety';
import { calls, fakeHost, resetSp2 } from '@tests/fakes/sp4/sp2';
import { asSeeker, call, request, seedOrg, seedUser, setupRouteDb } from '@tests/helpers/sp4';
import { DELETE } from './[type]/[id]/route';
import { GET, PUT } from './route';

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
// W4 owns withdrawing and W1 owns community identities; the routes use stand-ins.
const mocks = vi.hoisted(() => ({ withdrawOpenForOrg: vi.fn(), getCommunityIdentities: vi.fn() }));
vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  withdrawOpenForOrg: mocks.withdrawOpenForOrg,
}));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  getCommunityIdentities: mocks.getCommunityIdentities,
}));
vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
}));

const t = setupRouteDb();
let seeker: CurrentUser;
let orgId: string;

beforeEach(async () => {
  resetSp2();
  mocks.withdrawOpenForOrg.mockReset();
  mocks.withdrawOpenForOrg.mockResolvedValue(0);
  mocks.getCommunityIdentities.mockReset();
  mocks.getCommunityIdentities.mockResolvedValue(new Map());
  vi.mocked(kickWorker).mockClear();
  seeker = await seedUser(t.db, { accountType: 'seeker' });
  ({ orgId } = await seedOrg(t.db));
  fakeHost(orgId, { name: 'Kettle Ridge Lodge' });
  asSeeker(seeker);
});

const put = (body: unknown) => call(PUT, request('PUT', '/api/v1/me/blocks', { body }));

describe('PUT /me/blocks', () => {
  it('blocks the host and withdraws open applications to it when asked, in one go', async () => {
    mocks.withdrawOpenForOrg.mockResolvedValue(2);
    const res = await put({ targetType: 'org', targetId: orgId, withdrawApplications: true });
    expect(res.status).toBe(204);
    expect(mocks.withdrawOpenForOrg).toHaveBeenCalledTimes(1);
    expect(mocks.withdrawOpenForOrg.mock.calls[0]?.[1]).toEqual({ seekerUserId: seeker.id, orgId });
    expect(kickWorker).toHaveBeenCalledTimes(1);
    expect(
      await isBlockedBetween(t.db, { type: 'user', id: seeker.id }, { type: 'org', id: orgId }),
    ).toEqual({ blocked: true, byA: true, byB: false });
    expect(calls.unfollow).toEqual([{ userId: seeker.id, orgId }]);
  });

  it('withdraws nothing unless asked, and blocking twice is fine', async () => {
    expect((await put({ targetType: 'org', targetId: orgId })).status).toBe(204);
    expect((await put({ targetType: 'org', targetId: orgId, withdrawApplications: false })).status).toBe(
      204,
    );
    expect(mocks.withdrawOpenForOrg).not.toHaveBeenCalled();
    expect(kickWorker).not.toHaveBeenCalled();
  });

  it('rolls the block back when withdrawing fails', async () => {
    mocks.withdrawOpenForOrg.mockRejectedValue(new Error('boom'));
    const res = await put({ targetType: 'org', targetId: orgId, withdrawApplications: true });
    expect(res.status).toBe(500);
    expect(
      (await isBlockedBetween(t.db, { type: 'user', id: seeker.id }, { type: 'org', id: orgId }))
        .blocked,
    ).toBe(false);
  });

  it('refuses blocking yourself, and someone who does not exist', async () => {
    expect((await put({ targetType: 'user', targetId: seeker.id })).status).toBe(400);
    expect((await put({ targetType: 'org', targetId: '01970000-0000-7000-8000-000000000000' })).status).toBe(
      404,
    );
  });
});

describe('GET /me/blocks', () => {
  it('lists the hosts and people you blocked, and never a host that blocked you', async () => {
    const person = await seedUser(t.db, { accountType: 'seeker' });
    const { orgId: blockedMe } = await seedOrg(t.db, { name: 'Glacier Bay Tours' });
    fakeHost(blockedMe, { name: 'Glacier Bay Tours' });
    const member = await seedUser(t.db, { accountType: 'host' });
    await block(t.db, { type: 'org', id: blockedMe }, { type: 'user', id: seeker.id }, member.id);
    expect((await put({ targetType: 'org', targetId: orgId })).status).toBe(204);
    expect((await put({ targetType: 'user', targetId: person.id })).status).toBe(204);
    mocks.getCommunityIdentities.mockResolvedValue(
      new Map([[person.id, { displayName: 'Ana Ruiz', firstName: 'Ana', lastInitial: 'R', avatarMediaId: null }]]),
    );

    const res = await call(GET, request('GET', '/api/v1/me/blocks'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.body).toEqual({
      orgs: [{ orgId, name: 'Kettle Ridge Lodge', logoMediaId: null, blockedAt: expect.any(String) }],
      users: [{ userId: person.id, displayName: 'Ana Ruiz', blockedAt: expect.any(String) }],
    });
    expect(JSON.stringify(res.body)).not.toContain(blockedMe);
  });

  it('still lists a blocked host whose page is not public', async () => {
    const { orgId: hidden } = await seedOrg(t.db, { name: 'Quiet Cove Inn' });
    expect((await put({ targetType: 'org', targetId: hidden })).status).toBe(204);
    const res = await call(GET, request('GET', '/api/v1/me/blocks'));
    expect(res.body).toEqual({
      orgs: [{ orgId: hidden, name: 'Quiet Cove Inn', logoMediaId: null, blockedAt: expect.any(String) }],
      users: [],
    });
  });
});

describe('DELETE /me/blocks/:type/:id', () => {
  it('unblocks, and unblocking again is fine', async () => {
    await put({ targetType: 'org', targetId: orgId });
    const del = () =>
      call(DELETE, request('DELETE', `/api/v1/me/blocks/org/${orgId}`), { type: 'org', id: orgId });
    expect((await del()).status).toBe(204);
    expect((await del()).status).toBe(204);
    expect(
      (await isBlockedBetween(t.db, { type: 'user', id: seeker.id }, { type: 'org', id: orgId }))
        .blocked,
    ).toBe(false);
  });

  it("never removes a host's block of you", async () => {
    const member = await seedUser(t.db, { accountType: 'host' });
    await block(t.db, { type: 'org', id: orgId }, { type: 'user', id: seeker.id }, member.id);
    const res = await call(DELETE, request('DELETE', `/api/v1/me/blocks/org/${orgId}`), {
      type: 'org',
      id: orgId,
    });
    expect(res.status).toBe(204);
    expect(
      (await isBlockedBetween(t.db, { type: 'org', id: orgId }, { type: 'user', id: seeker.id })).byA,
    ).toBe(true);
  });
});
