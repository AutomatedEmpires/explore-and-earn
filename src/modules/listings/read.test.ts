// Read APIs for other sub-projects (spec section 3) and the privacy handlers.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { orgsFake } from '../../../tests/fakes/sp2/orgs';
import { verificationFake } from '../../../tests/fakes/sp2/verification';
import { FIXED_NOW, seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import {
  closeListing,
  countActiveByLocation,
  getListingSummaries,
  getOrgListingFacts,
  getOrgListingStats,
  getPublishedListing,
  getRevision,
  listActiveListings,
  privacyHandlers,
} from './index';
import {
  seedDraftListing,
  seedListingFixture,
  seedLiveListing,
  type ListingFixture,
} from './test-fixtures';

vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));
vi.mock('@/modules/locations', async (orig) => ({
  ...(await orig<typeof import('@/modules/locations')>()),
  ...(await import('../../../tests/fakes/sp2/locations')).locationsFake,
}));
vi.mock('@/modules/billing', async (orig) => ({
  ...(await orig<typeof import('@/modules/billing')>()),
  ...(await import('../../../tests/fakes/sp2/billing')).billingFake,
}));
vi.mock('@/modules/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/modules/entitlements')>()),
  ...(await import('../../../tests/fakes/sp2/entitlements')).entitlementsFake,
}));
vi.mock('@/modules/verification', async (orig) => ({
  ...(await orig<typeof import('@/modules/verification')>()),
  ...(await import('../../../tests/fakes/sp2/verification')).verificationFake,
}));

let t: TestDb;
let db: Db;
let org: SeededOrg;
let fx: ListingFixture;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  for (const f of [orgsFake, locationsFake, billingFake, entitlementsFake, verificationFake]) {
    f.reset();
  }
  // Each test gets a fresh database view of active listings.
  await db.execute(sql`update app.listings set state = 'closed', closed_at = now(),
    close_reason = 'host' where state = 'active'`);
  org = await seedHostOrg(db);
  fx = await seedListingFixture(db, org);
});

describe('getPublishedListing and getRevision', () => {
  it('reads the live revision, with the application close time', async () => {
    const { id, revisionId } = await seedLiveListing(
      db,
      org.owner.ctx,
      fx.content((c) => {
        c.applying.deadline = '2027-05-01';
      }),
      FIXED_NOW,
    );
    const live = await getPublishedListing(db, id);
    expect(live).toMatchObject({
      listingId: id,
      revisionId,
      orgId: org.orgId,
      provenance: 'host_created',
      confirmedActiveAt: null,
    });
    expect(live?.content.basics.title).toBe('Lift Operator');
    expect(live?.firstPublishedAt.toISOString()).toBe(FIXED_NOW.toISOString());
    expect(live?.applicationsCloseAt?.toISOString()).toBe('2027-05-02T07:00:00.000Z');
    expect(live?.autoCloseAt?.toISOString()).toBe('2027-09-01T07:00:00.000Z');

    expect(await getRevision(db, revisionId)).toMatchObject({ revisionId, state: 'active' });
    await closeListing(db, org.owner.ctx, id, FIXED_NOW);
    expect(await getPublishedListing(db, id)).toBeNull();
    expect(await getRevision(db, revisionId)).toMatchObject({ state: 'closed' });
    await expect(getRevision(db, newId())).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('getListingSummaries', () => {
  it('returns every state, closed and removed included', async () => {
    const closed = await seedLiveListing(db, org.owner.ctx, fx.content(), FIXED_NOW);
    await closeListing(db, org.owner.ctx, closed.id, FIXED_NOW);
    const removed = await seedLiveListing(db, org.owner.ctx, fx.content(), FIXED_NOW);
    await db.execute(
      sql`update app.listings set state = 'removed', removed_at = now() where id = ${removed.id}`,
    );
    const draft = await seedDraftListing(db, org.owner.ctx, fx.content());

    const map = await getListingSummaries(db, [closed.id, removed.id, draft, newId()]);
    expect(map.size).toBe(3);
    expect(map.get(closed.id)).toEqual({
      orgId: org.orgId,
      title: 'Lift Operator',
      state: 'closed',
      locationId: fx.locationId,
      primaryCategory: 'seasonal',
      publishedRevisionId: closed.revisionId,
    });
    expect(map.get(removed.id)?.state).toBe('removed');
    expect(map.get(draft)).toMatchObject({ state: 'draft', publishedRevisionId: null });
  });
});

describe('listActiveListings', () => {
  it('pages by id', async () => {
    for (let i = 0; i < 3; i++) await seedLiveListing(db, org.owner.ctx, fx.content(), FIXED_NOW);
    const first = await listActiveListings(db, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.next).not.toBeNull();
    const second = await listActiveListings(db, { after: first.next ?? '', limit: 2 });
    expect(second.items).toHaveLength(1);
    expect(second.next).toBeNull();
    const ids = [...first.items, ...second.items].map((i) => i.listingId);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('per-org and per-location reads', () => {
  it('counts active listings and lists the hiring history', async () => {
    const a = await seedLiveListing(db, org.owner.ctx, fx.content(), FIXED_NOW);
    await seedLiveListing(db, org.owner.ctx, fx.content(), FIXED_NOW);
    await closeListing(db, org.owner.ctx, a.id, FIXED_NOW);
    await seedDraftListing(db, org.owner.ctx, fx.content());

    expect((await countActiveByLocation(db, [fx.locationId])).get(fx.locationId)).toBe(1);
    expect((await getOrgListingStats(db, [org.orgId])).get(org.orgId)).toEqual({ active: 1 });
    const facts = await getOrgListingFacts(db, org.orgId);
    expect(facts.active).toHaveLength(1);
    expect(facts.history).toHaveLength(2);
    expect(facts.history[0]).toEqual({ firstPublishedAt: FIXED_NOW, primaryCategory: 'seasonal' });
  });
});

describe('privacyHandlers', () => {
  it("exports a user's listings and erases their name from them", async () => {
    const { id } = await seedLiveListing(db, org.owner.ctx, fx.content(), FIXED_NOW);
    const exported = await privacyHandlers.export(db, org.owner.userId);
    expect((exported.listings as { id: string }[]).map((l) => l.id)).toContain(id);

    await privacyHandlers.erase(db, org.owner.userId);
    const [row] = await queryRows<{ created_by: string | null; last_edited_by: string | null }>(
      db,
      sql`select created_by, last_edited_by from app.listings where id = ${id}`,
    );
    expect(row).toEqual({ created_by: null, last_edited_by: null });
    const [rev] = await queryRows<{ submitted_by: string | null }>(
      db,
      sql`select submitted_by from app.listing_revisions where listing_id = ${id}`,
    );
    expect(rev?.submitted_by).toBeNull();
  });
});
