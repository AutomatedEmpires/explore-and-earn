// The SP2 module fakes: every function a B1 task consumes from a fake works (none falls through
// to its W0 stub), with the semantics the plan names.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import * as entitlements from '@/modules/entitlements';
import { buildListingContent, seedHostOrg, seedMember } from '../../helpers/sp2';
import { createTestDb, type TestDb } from '../../helpers/db';
import { billingFake } from './billing';
import { entitlementsFake } from './entitlements';
import { hostpagesFake } from './hostpages';
import { listingsFake } from './listings';
import { locationsFake } from './locations';
import { orgsFake } from './orgs';
import { verificationFake } from './verification';

// The documented way B1 tests swap a sibling module for its fake.
vi.mock('@/modules/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/modules/entitlements')>()),
  ...(await import('./entitlements')).entitlementsFake,
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  entitlementsFake.reset();
  billingFake.reset();
  listingsFake.reset();
  locationsFake.reset();
  verificationFake.reset();
  hostpagesFake.reset();
  orgsFake.reset();
});

const actor = { type: 'system' as const, id: null };

/** A bare listing row: member assignments reference app.listings (drizzle/1200_listings.sql). */
async function insertListing(orgId: string): Promise<string> {
  const id = newId();
  await t.db.execute(sql`insert into app.listings (id, org_id) values (${id}, ${orgId})`);
  return id;
}

/** Runs `fn` and fails if it rejects with a W0 stub's "not implemented". */
async function works(name: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('not implemented')) {
      throw new Error(`${name} fell through to its stub: ${err.message}`);
    }
    throw err;
  }
}

describe('vi.mock with a fake', () => {
  it('replaces the module functions', () => {
    expect(entitlements.getCapacity).toBe(entitlementsFake.getCapacity);
  });
});

describe('every consumed fake function works', () => {
  it('entitlements', async () => {
    const orgId = newId();
    const db = t.db;
    await works('grant', () =>
      entitlementsFake.grant(db, {
        orgId,
        kind: 'invite_credit',
        quantity: 5,
        source: 'plan',
        sourceRef: 'sub_1',
        idempotencyKey: `k:${orgId}`,
        actor,
      }),
    );
    const [open] = await entitlementsFake.listOpenGrants(db, orgId, { source: 'plan' });
    expect(open?.quantity).toBe(5);
    await works('endGrant', () => entitlementsFake.endGrant(db, open?.id ?? '', new Date(), actor));
    await works('lockOrg', () => db.transaction((tx) => entitlementsFake.lockOrg(tx, orgId)));
    await works('getCapacity', () => entitlementsFake.getCapacity(db, orgId, 'seat'));
    await works('getBalance', () => entitlementsFake.getBalance(db, orgId, 'invite_credit'));
    await works('withCapacity', () =>
      db.transaction((tx) =>
        entitlementsFake.withCapacity(tx, orgId, 'listing_slot', 1, async () => 'ok'),
      ),
    );
    await works('registerUsageCounter', () =>
      entitlementsFake.registerUsageCounter('seat', async () => 1),
    );
    await works('consume', () =>
      entitlementsFake.consume(db, {
        orgId,
        kind: 'invite_credit',
        subjectType: 'test',
        subjectId: 's1',
        idempotencyKey: `c:${orgId}`,
        actor,
      }),
    );
    expect(entitlementsFake.calls.map((c) => c.name)).toContain('lockOrg');
  });

  it('billing', async () => {
    const orgId = newId();
    const db = t.db;
    for (const [name, fn] of [
      ['getSubscriptionState', () => billingFake.getSubscriptionState(db, orgId)],
      ['getSubscriberBadges', () => billingFake.getSubscriberBadges(db, [orgId])],
      ['getPendingKeepList', () => billingFake.getPendingKeepList(db, orgId)],
      ['settlePendingChange', () => billingFake.settlePendingChange(db, orgId)],
      ['sanctionOrg', () => billingFake.sanctionOrg(db, orgId, 'ban', actor)],
      ['cancelSubscriptionNow', () => billingFake.cancelSubscriptionNow(db, orgId)],
      ['getCardChecks', () => billingFake.getCardChecks(db, orgId)],
      ['getFoundingCount', () => billingFake.getFoundingCount(db)],
      ['ensureStripeCustomer', () => billingFake.ensureStripeCustomer(db, orgId)],
    ] as const) {
      await works(name, fn);
    }
    expect(await billingFake.getCardChecks(db, orgId)).toEqual({
      hasCard: true,
      cvcCheck: 'pass',
      postalCheck: 'pass',
    });
    expect(billingFake.callsTo('sanctionOrg')).toEqual([[orgId, 'ban', actor]]);
    expect(await billingFake.getSubscriptionState(db, orgId)).toMatchObject({
      status: 'active',
      plan: 'professional',
      interval: 'month',
      entitled: true,
      canPublish: true,
      hostSince: new Date('2026-11-03T00:00:00Z'),
    });
  });

  it('orgs', async () => {
    const db = t.db;
    const org = await seedHostOrg(db);
    const ctx = org.owner.ctx;
    for (const [name, fn] of [
      ['listMembers', () => orgsFake.listMembers(db, org.orgId)],
      ['getMember', () => orgsFake.getMember(db, org.orgId, org.owner.userId)],
      ['getOrgStatus', () => orgsFake.getOrgStatus(db, org.orgId)],
      ['getOrgSummaries', () => orgsFake.getOrgSummaries(db, [org.orgId])],
      ['setOrgStatus', () => orgsFake.setOrgStatus(db, org.orgId, 'active', actor)],
      ['setVerificationStatus', () => orgsFake.setVerificationStatus(db, org.orgId, 'verified')],
      ['getListingAccess', () => orgsFake.getListingAccess(db, ctx)],
      [
        'canAccessListing',
        () => orgsFake.canAccessListing(db, ctx, { id: newId(), locationId: null }),
      ],
      ['resolveSlug', () => orgsFake.resolveSlug(db, 'kettle-ridge-lodge')],
    ] as const) {
      await works(name, fn);
    }
    const recruiter = await seedMember(db, org.orgId, 'recruiter', { scope: 'assigned' });
    const assignedId = await insertListing(org.orgId);
    await works('assignListing', () =>
      orgsFake.assignListing(db, org.orgId, recruiter.userId, assignedId),
    );

    const members = await orgsFake.listMembers(db, org.orgId);
    expect(members.map((m) => m.role)).toEqual(['owner', 'recruiter']);
    expect((await orgsFake.getOrgSummaries(db, [org.orgId])).get(org.orgId)).toMatchObject({
      status: 'active',
      verificationStatus: 'verified',
      ownerUserId: org.owner.userId,
      deleted: false,
    });
  });

  it('locations, verification, listings and hostpages', async () => {
    const db = t.db;
    const orgId = newId();
    for (const [name, fn] of [
      ['getLocations', () => locationsFake.getLocations(db, [newId()])],
      ['listOrgLocations', () => locationsFake.listOrgLocations(db, orgId)],
      ['getWeather', () => locationsFake.getWeather(db, [newId()])],
      [
        'registerWeatherOrgFilter',
        () => locationsFake.registerWeatherOrgFilter(async (_d, ids) => ids),
      ],
      ['getVerificationStatus', () => verificationFake.getVerificationStatus(db, orgId)],
      ['startVerification', () => verificationFake.startVerification(db, orgId, newId())],
      [
        'openVerificationAppeal',
        () => verificationFake.openVerificationAppeal(db, orgId, 'Please'),
      ],
      ['getOrgListingFacts', () => listingsFake.getOrgListingFacts(db, orgId)],
      ['getOrgListingStats', () => listingsFake.getOrgListingStats(db, [orgId])],
      ['closeAllForOrg', () => listingsFake.closeAllForOrg(db, orgId, 'org_suspended')],
      ['enforceSlotLimit', () => listingsFake.enforceSlotLimit(db, orgId)],
      ['countActiveByLocation', () => listingsFake.countActiveByLocation(db, [newId()])],
      ['getHostIdentities', () => hostpagesFake.getHostIdentities(db, [orgId])],
      ['listFollowerIds', () => hostpagesFake.listFollowerIds(db, orgId, { limit: 10 })],
      ['unfollow', () => hostpagesFake.unfollow(db, newId(), orgId)],
    ] as const) {
      await works(name, fn);
    }
    expect(await verificationFake.getVerificationStatus(db, orgId)).toBe('running');
  });
});

describe('entitlementsFake', () => {
  it('keeps a grant key once, even after the grant ended', async () => {
    const orgId = newId();
    const g = {
      orgId,
      kind: 'listing_slot' as const,
      quantity: 12,
      source: 'plan' as const,
      sourceRef: 'sub_1',
      idempotencyKey: `plan:${orgId}:listing_slot:12:1`,
      actor,
    };
    const first = await entitlementsFake.grant(t.db, g);
    expect(first.created).toBe(true);
    expect(await entitlementsFake.getCapacity(t.db, orgId, 'listing_slot')).toMatchObject({
      limit: 12,
    });

    await entitlementsFake.endGrant(t.db, first.grantId, new Date(Date.now() - 1000), actor);
    const again = await entitlementsFake.grant(t.db, g);
    expect(again).toEqual({ grantId: first.grantId, created: false });
    expect(await entitlementsFake.getCapacity(t.db, orgId, 'listing_slot')).toMatchObject({
      limit: 0,
    });
  });

  it('uses the defaults before any grant, and setLimit over everything', async () => {
    const orgId = newId();
    expect(await entitlementsFake.getCapacity(t.db, orgId, 'listing_slot')).toEqual({
      limit: 10,
      used: 0,
    });
    entitlementsFake.setLimit(orgId, 'seat', 1);
    entitlementsFake.setUsed(orgId, 'seat', 1);
    expect(await entitlementsFake.getCapacity(t.db, orgId, 'seat')).toEqual({ limit: 1, used: 1 });
    await expect(
      t.db.transaction((tx) => entitlementsFake.withCapacity(tx, orgId, 'seat', 1, async () => 1)),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'seat_limit', limit: 1, used: 1 },
    });
  });

  it('consumes, balances and reverses credits', async () => {
    const orgId = newId();
    await entitlementsFake.grant(t.db, {
      orgId,
      kind: 'invite_credit',
      quantity: 50,
      source: 'plan',
      sourceRef: 'sub_1',
      validUntil: new Date(Date.now() + 86_400_000),
      idempotencyKey: `credits:${orgId}`,
      actor,
    });
    const used = await entitlementsFake.consume(t.db, {
      orgId,
      kind: 'invite_credit',
      subjectType: 'invite',
      subjectId: 'i1',
      idempotencyKey: `invite:${orgId}:1`,
      actor,
    });
    expect(used).toMatchObject({ ok: true, remaining: 49 });
    expect((await entitlementsFake.getBalance(t.db, orgId, 'invite_credit')).balance).toBe(49);

    const repeat = await entitlementsFake.consume(t.db, {
      orgId,
      kind: 'invite_credit',
      subjectType: 'invite',
      subjectId: 'i1',
      idempotencyKey: `invite:${orgId}:1`,
      actor,
    });
    expect(repeat).toEqual(used);
    if (!used.ok) throw new Error('expected a consumption');
    await entitlementsFake.reverse(t.db, used.consumptionId, 'test', actor);
    expect((await entitlementsFake.getBalance(t.db, orgId, 'invite_credit')).balance).toBe(50);
  });

  it('counts usage with the registered counter', async () => {
    const orgId = newId();
    entitlementsFake.registerUsageCounter('listing_slot', async () => 7);
    expect(await entitlementsFake.getCapacity(t.db, orgId, 'listing_slot')).toEqual({
      limit: 10,
      used: 7,
    });
  });
});

describe('orgsFake', () => {
  it("lists an assigned Recruiter's listings after assignListing", async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    const listingId = await insertListing(org.orgId);
    await orgsFake.assignListing(t.db, org.orgId, recruiter.userId, listingId);

    expect(await orgsFake.getListingAccess(t.db, recruiter.ctx)).toEqual({
      all: false,
      listingIds: [listingId],
      locationIds: [],
    });
    expect(
      await orgsFake.canAccessListing(t.db, recruiter.ctx, { id: listingId, locationId: null }),
    ).toBe(true);
    expect(
      await orgsFake.canAccessListing(t.db, recruiter.ctx, { id: newId(), locationId: null }),
    ).toBe(false);
    expect(await orgsFake.getListingAccess(t.db, org.owner.ctx)).toEqual({ all: true });
    const billing = await seedMember(t.db, org.orgId, 'billing');
    expect(await orgsFake.getListingAccess(t.db, billing.ctx)).toEqual({
      all: false,
      listingIds: [],
      locationIds: [],
    });
    expect((await orgsFake.getMember(t.db, org.orgId, recruiter.userId))?.scope).toEqual({
      kind: 'assigned',
      listingIds: [listingId],
      locationIds: [],
    });
  });

  it('resolves current and retired slugs', async () => {
    const org = await seedHostOrg(t.db, { name: 'Salt and Pine' });
    const [summary] = (await orgsFake.getOrgSummaries(t.db, [org.orgId])).values();
    const oldSlug = summary?.slug ?? '';
    await t.db.execute(
      sql`update app.organizations set slug = ${`${oldSlug}-co`} where id = ${org.orgId}`,
    );

    expect(await orgsFake.resolveSlug(t.db, oldSlug)).toEqual({
      orgId: org.orgId,
      currentSlug: `${oldSlug}-co`,
      retired: true,
    });
    expect(await orgsFake.resolveSlug(t.db, `${oldSlug}-co`)).toEqual({
      orgId: org.orgId,
      currentSlug: `${oldSlug}-co`,
      retired: false,
    });
    expect(await orgsFake.resolveSlug(t.db, 'no-such-host')).toBeNull();
  });
});

describe('billingFake', () => {
  it('omits orgs that are not entitled from the badges', async () => {
    const a = newId();
    const b = newId();
    billingFake.setState(b, { entitled: false, status: 'canceled', hostSince: null });
    const badges = await billingFake.getSubscriberBadges(t.db, [a, b]);
    expect([...badges.keys()]).toEqual([a]);
    expect(badges.get(a)).toEqual({ hostSince: new Date('2026-11-03T00:00:00Z') });
  });
});

describe('listingsFake', () => {
  it('derives summaries, facts and counts from the listings it holds', async () => {
    const orgId = newId();
    const locationId = newId();
    const content = buildListingContent({
      locationId,
      coverMediaId: newId(),
      housingPhotos: { bedroom: newId(), bathroom: newId(), kitchen: newId(), exterior: newId() },
    });
    const listingId = newId();
    listingsFake.setListing({
      listingId,
      revisionId: newId(),
      orgId,
      content,
      firstPublishedAt: new Date('2026-10-01T00:00:00Z'),
      publishedAt: new Date('2026-10-01T00:00:00Z'),
      confirmedActiveAt: null,
      autoCloseAt: null,
      applicationsCloseAt: null,
      provenance: 'host_created',
    });
    expect((await listingsFake.countActiveByLocation(t.db, [locationId])).get(locationId)).toBe(1);
    expect((await listingsFake.getOrgListingStats(t.db, [orgId])).get(orgId)).toEqual({
      active: 1,
    });
    expect(
      (await listingsFake.getListingSummaries(t.db, [listingId])).get(listingId),
    ).toMatchObject({
      title: 'Lift Operator',
      state: 'active',
      locationId,
      primaryCategory: 'seasonal',
    });
    await listingsFake.closeAllForOrg(t.db, orgId, 'org_suspended');
    expect(listingsFake.stateOf(listingId)).toBe('closed');
    expect(await listingsFake.getPublishedListing(t.db, listingId)).toBeNull();
  });
});
