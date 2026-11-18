import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offers } from '@/db/schema';
import { newId } from '@/lib/ids';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { asHost, asUser, call, mockDbModule, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedEntry, seedHostOrg, seedOffer, seedSeeker } from '@tests/helpers/sp5';
import { GET } from './route';

vi.mock('@/lib/db', async (orig) => mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...applicationsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...messagingFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...orgsFake,
}));

const t = setupRouteDb();

beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
});

describe('GET /api/v1/offers/:id/letter', () => {
  it('redirects the seeker to a signed letter and hides it from everyone else', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand' });
    orgsFake.setAccess(org.owner.userId, { all: true });
    const applicationId = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'offered',
    });
    const letterId = newId();
    await t.db.execute(sql`
      insert into app.media (id, owner_user_id, owner_org_id, kind, status, bucket, path,
        declared_mime, detected_mime, size_bytes)
      values (${letterId}, ${org.owner.userId}, ${org.orgId}, 'attachment', 'approved', 'media-private',
        ${letterId}, 'application/pdf', 'application/pdf', 1000)
    `);
    const offerId = await seedOffer(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId: newId(),
      createdBy: org.owner.userId,
    });
    await t.db.update(offers).set({ letterMediaId: letterId }).where(eq(offers.id, offerId));

    asUser(seeker.user);
    const ok = await call(GET, request('GET', `/api/v1/offers/${offerId}/letter`), { id: offerId });
    expect(ok.status).toBe(302);
    expect(ok.headers.get('location')).toContain('token=');

    asUser(other.user);
    const stranger = await call(GET, request('GET', `/api/v1/offers/${offerId}/letter`), { id: offerId });
    expect(stranger.status).toBe(404);

    const recruiter = {
      ...org.owner.ctx,
      role: 'recruiter' as const,
      user: { ...org.owner.ctx.user, id: newId() },
    };
    orgsFake.setAccess(recruiter.user.id, { all: false, listingIds: [], locationIds: [] });
    asHost(recruiter);
    const hidden = await call(GET, request('GET', `/api/v1/offers/${offerId}/letter`), { id: offerId });
    expect(hidden.status).toBe(404);

    await t.db.update(offers).set({ scanState: 'held' }).where(eq(offers.id, offerId));
    asUser(seeker.user);
    const held = await call(GET, request('GET', `/api/v1/offers/${offerId}/letter`), { id: offerId });
    expect(held.status).toBe(404);
  });
});
