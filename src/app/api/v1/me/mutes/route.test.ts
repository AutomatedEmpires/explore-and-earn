// The seeker's mute routes over HTTP (SP4 spec 5 and 8.7, plan Task 26): mute a host (which
// also unfollows it), list the hosts you muted, and unmute.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/modules/identity';
import { calls, fakeHost, resetSp2 } from '@tests/fakes/sp4/sp2';
import { asSeeker, call, request, seedOrg, seedUser, setupRouteDb } from '@tests/helpers/sp4';
import { DELETE, PUT } from './[orgId]/route';
import { GET } from './route';

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

const t = setupRouteDb();
let seeker: CurrentUser;
let orgId: string;

beforeEach(async () => {
  resetSp2();
  seeker = await seedUser(t.db, { accountType: 'seeker' });
  ({ orgId } = await seedOrg(t.db));
  fakeHost(orgId, { name: 'Kettle Ridge Lodge' });
  asSeeker(seeker);
});

const path = (id: string) => `/api/v1/me/mutes/${id}`;
const list = () => call(GET, request('GET', '/api/v1/me/mutes'));

describe('/me/mutes', () => {
  it('mutes a host, lists it, and unmutes it', async () => {
    expect((await call(PUT, request('PUT', path(orgId)), { orgId })).status).toBe(204);
    expect((await call(PUT, request('PUT', path(orgId)), { orgId })).status).toBe(204);
    expect(calls.unfollow).toContainEqual({ userId: seeker.id, orgId });

    const listed = await list();
    expect(listed.status).toBe(200);
    expect(listed.headers.get('cache-control')).toBe('private, no-store');
    expect(listed.body).toEqual({
      items: [{ orgId, name: 'Kettle Ridge Lodge', mutedAt: expect.any(String) }],
    });

    expect((await call(DELETE, request('DELETE', path(orgId)), { orgId })).status).toBe(204);
    expect((await call(DELETE, request('DELETE', path(orgId)), { orgId })).status).toBe(204);
    expect((await list()).body).toEqual({ items: [] });
  });

  it('refuses a host that does not exist', async () => {
    const missing = '01970000-0000-7000-8000-000000000000';
    expect((await call(PUT, request('PUT', path(missing)), { orgId: missing })).status).toBe(404);
  });

  it('lists only your own mutes', async () => {
    const other = await seedUser(t.db, { accountType: 'seeker' });
    asSeeker(other);
    await call(PUT, request('PUT', path(orgId)), { orgId });
    asSeeker(seeker);
    expect((await list()).body).toEqual({ items: [] });
  });
});
