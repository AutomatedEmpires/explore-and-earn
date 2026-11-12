// Members and recruiter scopes (SP2 Task 17): who sees which listings.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedListingRow, seedLocation, seedMember } from '../../../tests/helpers/sp2';
import { assignListing, canAccessListing, getListingAccess, getMember, listMembers } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(
    sql`truncate app.member_assignments, app.org_invitations, app.org_slugs, app.org_memberships,
      app.organizations, app.users cascade`,
  );
});

async function assignLocation(membershipId: string, locationId: string) {
  await t.db.execute(sql`
    insert into app.member_assignments (id, membership_id, location_id)
    values (${newId()}, ${membershipId}, ${locationId})
  `);
}

describe('getListingAccess and canAccessListing', () => {
  it('limits an assigned Recruiter to their location', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    const l1 = await seedLocation(t.db, { orgId: org.orgId });
    const l2 = await seedLocation(t.db, { orgId: org.orgId, name: 'Other site' });
    await assignLocation(recruiter.membershipId, l1);

    expect(await getListingAccess(t.db, recruiter.ctx)).toEqual({
      all: false,
      listingIds: [],
      locationIds: [l1],
    });
    expect(await canAccessListing(t.db, recruiter.ctx, { id: newId(), locationId: l1 })).toBe(true);
    expect(await canAccessListing(t.db, recruiter.ctx, { id: newId(), locationId: l2 })).toBe(
      false,
    );
    expect(await canAccessListing(t.db, recruiter.ctx, { id: newId(), locationId: null })).toBe(
      false,
    );
  });

  it('lets an assigned Recruiter reach a listing assigned to them by id', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    const listingId = await seedListingRow(t.db, { orgId: org.orgId });
    await assignListing(t.db, org.orgId, recruiter.userId, listingId);

    expect(await getListingAccess(t.db, recruiter.ctx)).toEqual({
      all: false,
      listingIds: [listingId],
      locationIds: [],
    });
    expect(await canAccessListing(t.db, recruiter.ctx, { id: listingId, locationId: null })).toBe(
      true,
    );
    // Assigning twice keeps one row.
    await assignListing(t.db, org.orgId, recruiter.userId, listingId);
    expect(await getListingAccess(t.db, recruiter.ctx)).toEqual({
      all: false,
      listingIds: [listingId],
      locationIds: [],
    });
  });

  it('gives a Recruiter with scope all, the Owner and Admins every listing', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'all' });
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const listing = { id: newId(), locationId: newId() };

    for (const ctx of [recruiter.ctx, admin.ctx, org.owner.ctx]) {
      expect(await getListingAccess(t.db, ctx)).toEqual({ all: true });
      expect(await canAccessListing(t.db, ctx, listing)).toBe(true);
    }
  });

  it('gives a Billing member no listing at all', async () => {
    const org = await seedHostOrg(t.db);
    const billing = await seedMember(t.db, org.orgId, 'billing');

    expect(await getListingAccess(t.db, billing.ctx)).toEqual({
      all: false,
      listingIds: [],
      locationIds: [],
    });
    for (const locationId of [newId(), null]) {
      expect(await canAccessListing(t.db, billing.ctx, { id: newId(), locationId })).toBe(false);
    }
  });

  it('gives a removed member nothing', async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    await t.db.execute(
      sql`update app.org_memberships set deleted_at = now() where id = ${admin.membershipId}`,
    );
    expect(await getListingAccess(t.db, admin.ctx)).toEqual({
      all: false,
      listingIds: [],
      locationIds: [],
    });
  });

  it('does not assign listings to members who already see everything', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'all' });
    await assignListing(t.db, org.orgId, recruiter.userId, newId());
    await assignListing(t.db, org.orgId, org.owner.userId, newId());
    expect(await queryRows(t.db, sql`select 1 from app.member_assignments`)).toHaveLength(0);
  });

  it('refuses to assign a listing to someone outside the org', async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Other Lodge' });
    await expect(assignListing(t.db, org.orgId, other.owner.userId, newId())).rejects.toMatchObject(
      { code: 'not_found' },
    );
  });
});

describe('listMembers and getMember', () => {
  it('omits removed memberships and returns role, scope and joinedAt', async () => {
    const org = await seedHostOrg(t.db, { ownerEmail: 'sam@kettle.com' });
    const admin = await seedMember(t.db, org.orgId, 'admin', { email: 'ada@kettle.com' });
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', {
      email: 'rae@kettle.com',
      scope: 'assigned',
    });
    const billing = await seedMember(t.db, org.orgId, 'billing');
    const l1 = await seedLocation(t.db, { orgId: org.orgId });
    await assignLocation(recruiter.membershipId, l1);
    await t.db.execute(
      sql`update app.org_memberships set deleted_at = now() where id = ${billing.membershipId}`,
    );

    const members = await listMembers(t.db, org.orgId);
    expect(members.map((m) => m.membershipId)).toEqual([
      org.owner.membershipId,
      admin.membershipId,
      recruiter.membershipId,
    ]);
    expect(members[0]).toMatchObject({
      userId: org.owner.userId,
      email: 'sam@kettle.com',
      displayName: 'Sam Rivera',
      role: 'owner',
      scope: null,
    });
    expect(members[1]).toMatchObject({ role: 'admin', scope: null, email: 'ada@kettle.com' });
    expect(members[2]).toMatchObject({
      role: 'recruiter',
      scope: { kind: 'assigned', listingIds: [], locationIds: [l1] },
    });
    for (const m of members) expect(m.joinedAt).toBeInstanceOf(Date);

    expect(await getMember(t.db, org.orgId, billing.userId)).toBeNull();
    expect(await getMember(t.db, org.orgId, admin.userId)).toMatchObject({
      membershipId: admin.membershipId,
      role: 'admin',
    });
  });

  it('reports scope all for a Recruiter who sees everything', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    expect((await getMember(t.db, org.orgId, recruiter.userId))?.scope).toEqual({ kind: 'all' });
  });
});
