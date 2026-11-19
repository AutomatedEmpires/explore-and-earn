// The host Home summary (spec section 7 Home row): reminders by role and scope, quota, setup.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { orgsFake } from '../../../tests/fakes/sp2/orgs';
import { verificationFake } from '../../../tests/fakes/sp2/verification';
import { FIXED_NOW, seedHostOrg, seedMember, type SeededOrg } from '../../../tests/helpers/sp2';
import { getHomeSummary, jobHandlers, requestPublish } from './index';
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

const DAY = 86_400_000;

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
  org = await seedHostOrg(db);
  fx = await seedListingFixture(db, org);
});

const titled = (title: string) =>
  fx.content((c) => {
    c.basics.title = title;
  });

const kinds = (s: Awaited<ReturnType<typeof getHomeSummary>>) =>
  s.reminders.map((r) => r.kind).sort();

it('gives each role its reminders', async () => {
  await db.execute(
    sql`update app.organizations set require_recruiter_approval = true where id = ${org.orgId}`,
  );
  const recruiter = await seedMember(db, org.orgId, 'recruiter', { scope: 'assigned' });
  const billing = await seedMember(db, org.orgId, 'billing');

  // The Recruiter's own listing, live; an unanswered "Still hiring?".
  const own = await seedLiveListing(db, org.owner.ctx, titled('Lift Operator'), FIXED_NOW);
  await db.execute(sql`
    insert into app.member_assignments (id, membership_id, listing_id)
    values (gen_random_uuid(), ${recruiter.membershipId}, ${own.id})
  `);
  // Another live listing outside the Recruiter's scope, also reminded.
  await seedLiveListing(db, org.owner.ctx, titled('Ski Instructor'), FIXED_NOW);
  await jobHandlers['listings.still_hiring_sweep']?.(undefined, {
    db,
    now: new Date(FIXED_NOW.getTime() + 30 * DAY),
  });
  // A Recruiter listing waiting for approval (an unassigned Recruiter on the same team).
  const other = await seedMember(db, org.orgId, 'recruiter');
  const waiting = await seedDraftListing(db, other.ctx, titled('Line Cook'));
  await requestPublish(db, other.ctx, waiting, [], FIXED_NOW);
  billingFake.setState(org.orgId, { status: 'past_due', entitled: true, canPublish: false });

  const owner = await getHomeSummary(db, org.owner.ctx);
  expect(kinds(owner)).toEqual(['approval', 'payment', 'still_hiring', 'still_hiring']);
  expect(owner.reminders.find((r) => r.kind === 'approval')).toMatchObject({
    listingId: waiting,
    title: 'Line Cook is waiting for your approval',
    href: `/host/listings/${waiting}`,
  });
  expect(owner.reminders.find((r) => r.kind === 'payment')).toMatchObject({
    title: "Your last payment didn't go through",
    href: '/host/billing',
    listingId: null,
  });

  const scoped = await getHomeSummary(db, recruiter.ctx);
  expect(scoped.reminders).toEqual([
    expect.objectContaining({
      kind: 'still_hiring',
      listingId: own.id,
      title: 'Still hiring for Lift Operator?',
      href: `/host/listings/${own.id}`,
    }),
  ]);

  const billingSummary = await getHomeSummary(db, billing.ctx);
  expect(kinds(billingSummary)).toEqual(['payment']);
  expect(billingSummary.quota.listingSlots).toEqual({ used: 3, limit: 10 });
});

it('drops an answered "Still hiring?"', async () => {
  const { id } = await seedLiveListing(db, org.owner.ctx, titled('Lift Operator'), FIXED_NOW);
  await jobHandlers['listings.still_hiring_sweep']?.(undefined, {
    db,
    now: new Date(FIXED_NOW.getTime() + 30 * DAY),
  });
  await db.execute(
    sql`update app.listings set confirmed_active_at = ${new Date(FIXED_NOW.getTime() + 31 * DAY)}
      where id = ${id}`,
  );
  expect((await getHomeSummary(db, org.owner.ctx)).reminders).toEqual([]);
});

it('asks for verification info and suggests a repost', async () => {
  verificationFake.setStatus(org.orgId, 'needs_info');
  const { id } = await seedLiveListing(db, org.owner.ctx, titled('Lift Operator'), FIXED_NOW);
  await db.execute(sql`
    update app.listings set state = 'closed', closed_at = now(), close_reason = 'host',
      repost_reminded_year = ${new Date().getUTCFullYear()}
    where id = ${id}
  `);
  const summary = await getHomeSummary(db, org.owner.ctx);
  expect(summary.reminders.find((r) => r.kind === 'verification')).toMatchObject({
    title: 'We need a little more information to verify your business',
    href: '/host/settings/verification',
  });
  expect(summary.reminders.find((r) => r.kind === 'repost')).toMatchObject({
    listingId: id,
    title: 'Time to repost Lift Operator?',
  });
});

it('reports quota and setup', async () => {
  entitlementsFake.setLimit(org.orgId, 'seat', 5);
  await entitlementsFake.grant(db, {
    orgId: org.orgId,
    kind: 'invite_credit',
    quantity: 50,
    source: 'plan',
    sourceRef: 'sub_1',
    idempotencyKey: `credits:${org.orgId}`,
    actor: { type: 'system', id: null },
  });
  let summary = await getHomeSummary(db, org.owner.ctx);
  expect(summary.setup).toEqual({ location: true, plan: true, firstListing: false });
  expect(summary.quota.inviteCredits.balance).toBe(50);
  expect(summary.quota.seats.limit).toBe(5);

  await seedLiveListing(db, org.owner.ctx, titled('Lift Operator'), FIXED_NOW);
  summary = await getHomeSummary(db, org.owner.ctx);
  expect(summary.setup.firstListing).toBe(true);

  billingFake.setState(org.orgId, { status: 'none', entitled: false, canPublish: false });
  locationsFake.reset();
  summary = await getHomeSummary(db, org.owner.ctx);
  expect(summary.setup).toMatchObject({ location: false, plan: false });
});
