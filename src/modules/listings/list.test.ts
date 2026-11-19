// The host listings screen data (spec sections 5 and 7): tabs, recruiter scope, search, slots,
// and stats and row badges from providers.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { orgsFake } from '../../../tests/fakes/sp2/orgs';
import { verificationFake } from '../../../tests/fakes/sp2/verification';
import { FIXED_NOW, seedHostOrg, seedMember, type SeededOrg } from '../../../tests/helpers/sp2';
import {
  closeListing,
  listOrgListings,
  patchDraft,
  registerListingRowBadgeProvider,
  registerListingStatsProvider,
  requestPublish,
} from './index';
import { clearListingProviders } from './providers';
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
  clearListingProviders();
  org = await seedHostOrg(db);
  fx = await seedListingFixture(db, org);
});

const titled = (title: string) =>
  fx.content((c) => {
    c.basics.title = title;
  });

/** One listing per tab state: active, in review, draft, closed and removed. */
async function seedTabs() {
  const active = await seedLiveListing(db, org.owner.ctx, titled('Lift Operator'), FIXED_NOW);
  const inReview = await seedDraftListing(db, org.owner.ctx, titled('Ski Instructor'));
  await requestPublish(db, org.owner.ctx, inReview, [], FIXED_NOW);
  const draft = await seedDraftListing(db, org.owner.ctx, titled('Line Cook'));
  const closed = await seedLiveListing(db, org.owner.ctx, titled('Housekeeper'), FIXED_NOW);
  await closeListing(db, org.owner.ctx, closed.id, FIXED_NOW);
  const removed = await seedLiveListing(db, org.owner.ctx, titled('Shuttle Driver'), FIXED_NOW);
  await db.execute(
    sql`update app.listings set state = 'removed', removed_at = now() where id = ${removed.id}`,
  );
  return { active: active.id, inReview, draft, closed: closed.id, removed: removed.id };
}

const ids = (r: Awaited<ReturnType<typeof listOrgListings>>) => r.items.map((i) => i.id).sort();

describe('listOrgListings', () => {
  it('splits Active, Drafts and Library', async () => {
    const s = await seedTabs();
    const ctx = org.owner.ctx;
    expect(ids(await listOrgListings(db, ctx, { tab: 'active' }))).toEqual(
      [s.active, s.inReview].sort(),
    );
    expect(ids(await listOrgListings(db, ctx, { tab: 'drafts' }))).toEqual([s.draft]);
    expect(ids(await listOrgListings(db, ctx, { tab: 'library' }))).toEqual(
      [s.active, s.closed, s.removed].sort(),
    );
    const active = await listOrgListings(db, ctx, { tab: 'active' });
    expect(active.slots).toEqual({ used: 2, limit: 10 });
    expect(active.items.find((i) => i.id === s.inReview)).toMatchObject({
      state: 'in_review',
      reviewStage: 'screening',
      title: 'Ski Instructor',
    });
  });

  it('finds titles case-insensitively and filters by location', async () => {
    const s = await seedTabs();
    expect(ids(await listOrgListings(db, org.owner.ctx, { tab: 'library', q: 'lift' }))).toEqual([
      s.active,
    ]);
    expect(
      (await listOrgListings(db, org.owner.ctx, { tab: 'active', locationId: newId() })).items,
    ).toEqual([]);
  });

  it('shows an assigned Recruiter only the listings in scope', async () => {
    const s = await seedTabs();
    const recruiter = await seedMember(db, org.orgId, 'recruiter', { scope: 'assigned' });
    await db.execute(sql`
      insert into app.member_assignments (id, membership_id, listing_id)
      values (${newId()}, ${recruiter.membershipId}, ${s.closed})
    `);
    expect(ids(await listOrgListings(db, recruiter.ctx, { tab: 'library' }))).toEqual([s.closed]);
    expect((await listOrgListings(db, recruiter.ctx, { tab: 'active' })).items).toEqual([]);
  });

  it('pages newest first, 25 at a time', async () => {
    for (let i = 0; i < 27; i++) await seedDraftListing(db, org.owner.ctx, titled(`Cook ${i}`));
    const first = await listOrgListings(db, org.owner.ctx, { tab: 'drafts' });
    expect(first.items).toHaveLength(25);
    expect(first.items[0]?.title).toBe('Cook 26');
    const second = await listOrgListings(db, org.owner.ctx, {
      tab: 'drafts',
      before: first.nextBefore ?? '',
    });
    expect(second.items.map((i) => i.title)).toEqual(['Cook 1', 'Cook 0']);
    expect(second.nextBefore).toBeNull();
  });

  it('flags unpublished changes on a live listing', async () => {
    const live = await seedLiveListing(db, org.owner.ctx, titled('Lift Operator'), FIXED_NOW);
    let row = (await listOrgListings(db, org.owner.ctx, { tab: 'active' })).items[0];
    expect(row?.hasUnpublishedChanges).toBe(false);
    await patchDraft(db, org.owner.ctx, live.id, {
      section: 'basics',
      baseVersion: 0,
      data: { basics: { ...titled('Lift Operator').basics, openings: 5 } },
    });
    row = (await listOrgListings(db, org.owner.ctx, { tab: 'active' })).items[0];
    expect(row?.hasUnpublishedChanges).toBe(true);
  });
});

describe('providers', () => {
  it('has no stats or badges without providers', async () => {
    await seedLiveListing(db, org.owner.ctx, titled('Lift Operator'), FIXED_NOW);
    const [row] = (await listOrgListings(db, org.owner.ctx, { tab: 'library' })).items;
    expect(row?.stats).toBeNull();
    expect(row?.badge).toBeNull();
  });

  it('merges stats from every provider and attaches row badges', async () => {
    const { id } = await seedLiveListing(db, org.owner.ctx, titled('Lift Operator'), FIXED_NOW);
    registerListingStatsProvider(
      'views',
      async (_db, list) => new Map(list.map((i) => [i, { views: 12 }])),
    );
    registerListingStatsProvider(
      'applications',
      async (_db, list) => new Map(list.map((i) => [i, { applications: 3 }])),
    );
    registerListingRowBadgeProvider(async (_db, orgId, list) =>
      orgId === org.orgId
        ? new Map(list.map((i) => [i, { label: 'Boosted until Dec 1', href: `/host/boosts/${i}` }]))
        : new Map(),
    );
    const [row] = (await listOrgListings(db, org.owner.ctx, { tab: 'library' })).items;
    expect(row?.stats).toEqual({ views: 12, saves: 0, applications: 3, hires: 0 });
    expect(row?.badge).toEqual({ label: 'Boosted until Dec 1', href: `/host/boosts/${id}` });
  });
});
