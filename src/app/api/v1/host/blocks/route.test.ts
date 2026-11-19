// The host's block routes over HTTP (SP4 spec 5, 8.7 and 10; plan Task 26). PUT is host*: an
// Owner, Admin or Recruiter blocks an applicant by application id, through the real
// authorizeHostApplication. GET and DELETE are Owner or Admin only. The list shows a first
// name and last initial, never a seeker id, and never a seeker who blocked the org.
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import type { OrgRole } from '@/modules/identity';
import { block, isBlockedBetween } from '@/modules/safety';
import type { HostContext } from '@/server/guards';
import { fakeHost, fakeListing, resetSp2, setListingAccess } from '@tests/fakes/sp4/sp2';
import { asHost, call, request, seedMember, seedOrg, seedUser, setupRouteDb } from '@tests/helpers/sp4';
import { DELETE } from './[blockId]/route';
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
// W1 owns community identities; the list is tested against a stand-in.
const mocks = vi.hoisted(() => ({ getCommunityIdentities: vi.fn() }));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  getCommunityIdentities: mocks.getCommunityIdentities,
}));

const t = setupRouteDb();

type Org = { orgId: string; members: Record<OrgRole, HostContext> };

async function seedHost(name = 'Kettle Ridge Lodge'): Promise<Org> {
  const { orgId } = await seedOrg(t.db, { name });
  fakeHost(orgId, { name });
  const members = {} as Record<OrgRole, HostContext>;
  for (const role of ['owner', 'admin', 'recruiter', 'billing'] as const) {
    members[role] = await seedMember(t.db, orgId, await seedUser(t.db, { accountType: 'host' }), role);
  }
  return { orgId, members };
}

/** An application by a new seeker to a listing of `org`; returns its id and the seeker. */
async function seedApplication(org: Org): Promise<{ applicationId: string; seekerId: string }> {
  const seekerId = (await seedUser(t.db, { accountType: 'seeker' })).id;
  const { listingId, revisionId } = fakeListing({ orgId: org.orgId, title: 'Deckhand' });
  const applicationId = newId();
  await t.db.execute(sql`
    insert into app.applications (id, listing_id, listing_revision_id, org_id, seeker_user_id,
      source, snapshot)
    values (${applicationId}, ${listingId}, ${revisionId}, ${org.orgId}, ${seekerId}, 'seek',
      '{}'::jsonb)
  `);
  return { applicationId, seekerId };
}

const put = (ctx: HostContext, applicationId: string) => {
  asHost(ctx);
  return call(PUT, request('PUT', '/api/v1/host/blocks', { body: { applicationId } }));
};

const orgBlocked = (orgId: string, seekerId: string) =>
  isBlockedBetween(t.db, { type: 'org', id: orgId }, { type: 'user', id: seekerId });

let org: Org;

beforeEach(async () => {
  resetSp2();
  mocks.getCommunityIdentities.mockReset();
  mocks.getCommunityIdentities.mockResolvedValue(new Map());
  org = await seedHost();
});

describe('PUT /host/blocks', () => {
  it('lets an Owner, Admin or Recruiter block an applicant', async () => {
    for (const role of ['owner', 'admin', 'recruiter'] as const) {
      const a = await seedApplication(org);
      expect((await put(org.members[role], a.applicationId)).status).toBe(204);
      expect((await orgBlocked(org.orgId, a.seekerId)).byA).toBe(true);
    }
  });

  it('refuses Billing with role_not_allowed', async () => {
    const a = await seedApplication(org);
    const res = await put(org.members.billing, a.applicationId);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { details: { reason: 'role_not_allowed' } } });
    expect((await orgBlocked(org.orgId, a.seekerId)).blocked).toBe(false);
  });

  it("answers not_found for another org's application, and one outside the member's listings", async () => {
    const other = await seedHost('Glacier Bay Tours');
    const theirs = await seedApplication(other);
    expect((await put(org.members.owner, theirs.applicationId)).status).toBe(404);
    expect((await orgBlocked(org.orgId, theirs.seekerId)).blocked).toBe(false);

    const mine = await seedApplication(org);
    setListingAccess(() => false);
    expect((await put(org.members.recruiter, mine.applicationId)).status).toBe(404);
  });

  it('answers not_found, never "blocked", when the applicant blocked the org', async () => {
    const a = await seedApplication(org);
    await block(t.db, { type: 'user', id: a.seekerId }, { type: 'org', id: org.orgId }, a.seekerId);
    const res = await put(org.members.owner, a.applicationId);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('block');
  });
});

describe('GET /host/blocks', () => {
  it('lists the applicants the org blocked by first name and last initial only', async () => {
    const a = await seedApplication(org);
    await put(org.members.recruiter, a.applicationId);
    // A seeker who blocked the org is not the org's block.
    const b = await seedApplication(org);
    await block(t.db, { type: 'user', id: b.seekerId }, { type: 'org', id: org.orgId }, b.seekerId);
    mocks.getCommunityIdentities.mockResolvedValue(
      new Map([[a.seekerId, { displayName: 'Maya Rodriguez', firstName: 'Maya', lastInitial: 'R', avatarMediaId: null }]]),
    );

    asHost(org.members.owner);
    const res = await call(GET, request('GET', '/api/v1/host/blocks'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const { items } = res.body as { items: Record<string, unknown>[] };
    expect(items).toEqual([
      { blockId: expect.any(String), firstName: 'Maya', lastInitial: 'R', blockedAt: expect.any(String) },
    ]);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(['blockId', 'blockedAt', 'firstName', 'lastInitial']);
    expect(JSON.stringify(res.body)).not.toContain(a.seekerId);
    expect(JSON.stringify(res.body)).not.toContain(b.seekerId);
  });

  it('refuses a Recruiter and Billing', async () => {
    for (const role of ['recruiter', 'billing'] as const) {
      asHost(org.members[role]);
      const res = await call(GET, request('GET', '/api/v1/host/blocks'));
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: { details: { reason: 'role_not_allowed' } } });
    }
  });
});

describe('DELETE /host/blocks/:blockId', () => {
  async function blockOne(): Promise<{ blockId: string; seekerId: string }> {
    const a = await seedApplication(org);
    await put(org.members.owner, a.applicationId);
    const { blockId } = await block(
      t.db,
      { type: 'org', id: org.orgId },
      { type: 'user', id: a.seekerId },
      org.members.owner.user.id,
    );
    return { blockId, seekerId: a.seekerId };
  }

  const del = (ctx: HostContext, blockId: string) => {
    asHost(ctx);
    return call(DELETE, request('DELETE', `/api/v1/host/blocks/${blockId}`), { blockId });
  };

  it('lets an Owner or Admin unblock', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const b = await blockOne();
      expect((await del(org.members[role], b.blockId)).status).toBe(204);
      expect((await orgBlocked(org.orgId, b.seekerId)).blocked).toBe(false);
    }
  });

  it('refuses a Recruiter with role_not_allowed', async () => {
    const b = await blockOne();
    const res = await del(org.members.recruiter, b.blockId);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { details: { reason: 'role_not_allowed' } } });
    expect((await orgBlocked(org.orgId, b.seekerId)).blocked).toBe(true);
  });

  it("answers not_found for another org's block and a seeker's block of the org", async () => {
    const b = await blockOne();
    const other = await seedHost('Glacier Bay Tours');
    expect((await del(other.members.owner, b.blockId)).status).toBe(404);
    expect((await orgBlocked(org.orgId, b.seekerId)).blocked).toBe(true);

    const seekerId = (await seedUser(t.db, { accountType: 'seeker' })).id;
    const theirs = await block(t.db, { type: 'user', id: seekerId }, { type: 'org', id: org.orgId }, seekerId);
    expect((await del(org.members.owner, theirs.blockId)).status).toBe(404);
  });
});
