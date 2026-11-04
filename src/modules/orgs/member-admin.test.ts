// Member changes, removal, ownership transfer and the privacy hooks (SP2 Task 19).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { makeFakeClerkAdmin } from '@/modules/identity';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedMember } from '../../../tests/helpers/sp2';
import {
  changeMember,
  getListingAccess,
  getMember,
  privacyHandlers,
  removeMember,
  transferOwnership,
} from './index';

// org.member_removed has no SP2 subscriber yet (SP5 adds one); a test topic makes it visible.
vi.mock('@/server/event-subscribers', async (orig) => {
  const m = await orig<typeof import('@/server/event-subscribers')>();
  return {
    ...m,
    eventSubscribers: { ...m.eventSubscribers, 'org.member_removed': ['test.member_removed'] },
  };
});

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
      app.organizations, app.notifications, app.users, app.outbox cascade`,
  );
});

const membershipRows = (orgId: string) =>
  queryRows<{ id: string; user_id: string; role: string; deleted_at: string | null }>(
    t.db,
    sql`select id, user_id, role, deleted_at from app.org_memberships
        where org_id = ${orgId} order by created_at`,
  );

const auditRows = (orgId: string, action: string) =>
  queryRows<{ actor_id: string; data: Record<string, unknown> }>(
    t.db,
    sql`select actor_id, data from app.audit_events where org_id = ${orgId} and action = ${action}`,
  );

const notificationsOf = (type: string) =>
  queryRows<{ user_id: string; title: string; body: string }>(
    t.db,
    sql`select user_id, title, body from app.notifications where type = ${type}`,
  );

describe('changeMember', () => {
  it("doesn't let an Admin change the Owner, and the Owner can't demote themselves", async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const clerk = makeFakeClerkAdmin();
    await expect(
      changeMember(t.db, clerk, admin.ctx, org.owner.membershipId, { role: 'billing' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      changeMember(t.db, clerk, org.owner.ctx, org.owner.membershipId, { role: 'admin' }),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'owner_must_transfer' } });
    expect(clerk.calls).toEqual([]);
  });

  it('changes a role in Clerk too, records it and tells the member', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    const clerk = makeFakeClerkAdmin();

    const member = await changeMember(t.db, clerk, admin.ctx, recruiter.membershipId, {
      role: 'billing',
    });
    expect(member).toMatchObject({ membershipId: recruiter.membershipId, role: 'billing' });
    expect(clerk.calls).toEqual([
      {
        method: 'updateMembershipRole',
        args: [org.clerkOrgId, recruiter.clerkUserId, 'org:billing'],
      },
    ]);
    const [audit] = await auditRows(org.orgId, 'orgs.member_changed');
    expect(audit).toMatchObject({
      actor_id: admin.userId,
      data: { userId: recruiter.userId, from: { role: 'recruiter' }, to: { role: 'billing' } },
    });
    const notes = await notificationsOf('orgs.member_changed');
    expect(notes).toEqual([
      {
        user_id: recruiter.userId,
        title: 'Your access at Kettle Ridge Lodge changed',
        body: "You're now a Billing member. A admin made the change.",
      },
    ]);
  });

  it("replaces a Recruiter's assignments without calling Clerk", async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    const clerk = makeFakeClerkAdmin();
    const l1 = newId();

    const member = await changeMember(t.db, clerk, org.owner.ctx, recruiter.membershipId, {
      scope: { kind: 'assigned', listingIds: [], locationIds: [l1] },
    });
    expect(member.scope).toEqual({ kind: 'assigned', listingIds: [], locationIds: [l1] });
    expect(await getListingAccess(t.db, recruiter.ctx)).toEqual({
      all: false,
      listingIds: [],
      locationIds: [l1],
    });
    expect(clerk.calls).toEqual([]);

    // Promoting them to Admin drops the assignments: Admins see everything.
    await changeMember(t.db, clerk, org.owner.ctx, recruiter.membershipId, { role: 'admin' });
    expect(await queryRows(t.db, sql`select 1 from app.member_assignments`)).toEqual([]);
    expect((await getMember(t.db, org.orgId, recruiter.userId))?.scope).toBeNull();
  });

  it('is for Owners and Admins, and 404s for another org', async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Other Lodge' });
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    const billing = await seedMember(t.db, org.orgId, 'billing');
    await expect(
      changeMember(t.db, makeFakeClerkAdmin(), recruiter.ctx, billing.membershipId, {
        role: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      changeMember(t.db, makeFakeClerkAdmin(), other.owner.ctx, billing.membershipId, {
        role: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('changes nothing when Clerk refuses the new role', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    const clerk = makeFakeClerkAdmin();
    clerk.failNext('updateMembershipRole');
    await expect(
      changeMember(t.db, clerk, org.owner.ctx, recruiter.membershipId, { role: 'admin' }),
    ).rejects.toThrow('fake Clerk');
    expect((await getMember(t.db, org.orgId, recruiter.userId))?.role).toBe('recruiter');
  });
});

describe('removeMember', () => {
  it("doesn't let an Admin remove the Owner, and the Owner must transfer before leaving", async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const clerk = makeFakeClerkAdmin();
    await expect(
      removeMember(t.db, clerk, admin.ctx, org.owner.membershipId),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      removeMember(t.db, clerk, org.owner.ctx, org.owner.membershipId),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'owner_must_transfer' } });
    expect(clerk.calls).toEqual([]);
  });

  it('removes a member, in Clerk too, and hands their work to the acting Admin', async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    await t.db.execute(sql`
      insert into app.member_assignments (id, membership_id, location_id)
      values (${newId()}, ${recruiter.membershipId}, ${newId()})
    `);
    const clerk = makeFakeClerkAdmin();

    await removeMember(t.db, clerk, admin.ctx, recruiter.membershipId);

    const row = (await membershipRows(org.orgId)).find((m) => m.id === recruiter.membershipId);
    expect(row?.deleted_at).not.toBeNull();
    expect(await queryRows(t.db, sql`select 1 from app.member_assignments`)).toEqual([]);
    expect(clerk.calls).toEqual([
      { method: 'removeMembership', args: [org.clerkOrgId, recruiter.clerkUserId] },
    ]);
    const [audit] = await auditRows(org.orgId, 'orgs.member_removed');
    expect(audit).toMatchObject({ actor_id: admin.userId, data: { userId: recruiter.userId } });

    const events = await queryRows<{ payload: { event: string; data: unknown } }>(
      t.db,
      sql`select payload from app.outbox where topic = 'test.member_removed'`,
    );
    expect(events.map((e) => e.payload.data)).toEqual([
      { orgId: org.orgId, userId: recruiter.userId, reassignToUserId: admin.userId },
    ]);
    expect(await getMember(t.db, org.orgId, recruiter.userId)).toBeNull();
    await expect(
      removeMember(t.db, clerk, admin.ctx, recruiter.membershipId),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lets anyone leave, handing their work to the Owner', async () => {
    const org = await seedHostOrg(t.db);
    const billing = await seedMember(t.db, org.orgId, 'billing');
    await removeMember(t.db, makeFakeClerkAdmin(), billing.ctx, billing.membershipId);
    const events = await queryRows<{ payload: { data: { reassignToUserId: string } } }>(
      t.db,
      sql`select payload from app.outbox where topic = 'test.member_removed'`,
    );
    expect(events.map((e) => e.payload.data.reassignToUserId)).toEqual([org.owner.userId]);
  });

  it("doesn't let a Recruiter remove someone else", async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    const billing = await seedMember(t.db, org.orgId, 'billing');
    await expect(
      removeMember(t.db, makeFakeClerkAdmin(), recruiter.ctx, billing.membershipId),
    ).rejects.toMatchObject({ code: 'forbidden', details: { reason: 'role_not_allowed' } });
  });
});

describe('transferOwnership', () => {
  it('goes only to an Admin', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    await expect(
      transferOwnership(t.db, org.owner.ctx, recruiter.membershipId),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'target_not_admin' } });
    await expect(
      transferOwnership(t.db, org.owner.ctx, org.owner.membershipId),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'target_not_admin' } });
  });

  it('leaves exactly one Owner and tells both people', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const admin = await seedMember(t.db, org.orgId, 'admin');

    await transferOwnership(t.db, org.owner.ctx, admin.membershipId);

    const rows = await membershipRows(org.orgId);
    expect(rows.filter((r) => r.role === 'owner').map((r) => r.user_id)).toEqual([admin.userId]);
    expect(rows.find((r) => r.user_id === org.owner.userId)?.role).toBe('admin');
    const [orgRow] = await queryRows<{ owner_user_id: string }>(
      t.db,
      sql`select owner_user_id from app.organizations where id = ${org.orgId}`,
    );
    expect(orgRow?.owner_user_id).toBe(admin.userId);

    const notes = await notificationsOf('orgs.ownership_transferred');
    expect(notes.map((n) => n.user_id).sort()).toEqual([org.owner.userId, admin.userId].sort());
    expect(notes[0]?.title).toBe('Kettle Ridge Lodge has a new Owner');
    expect(await auditRows(org.orgId, 'orgs.ownership_transferred')).toHaveLength(1);

    // The former Owner is an Admin now and can't transfer again.
    await expect(
      transferOwnership(
        t.db,
        { ...org.owner.ctx, role: 'admin' },
        (rows.find((r) => r.user_id === admin.userId) ?? { id: '' }).id,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('is for the Owner only', async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const other = await seedMember(t.db, org.orgId, 'admin');
    await expect(transferOwnership(t.db, admin.ctx, other.membershipId)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('privacyHandlers', () => {
  it('exports memberships and invitations sent, and erases memberships', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    await t.db.execute(sql`
      update app.org_memberships set invited_by = ${admin.userId} where id = ${recruiter.membershipId}
    `);
    await t.db.execute(sql`
      insert into app.member_assignments (id, membership_id, listing_id)
      values (${newId()}, ${recruiter.membershipId}, ${newId()})
    `);
    await t.db.execute(sql`
      insert into app.org_invitations (id, org_id, email, role, expires_at, invited_by)
      values (${newId()}, ${org.orgId}, 'maya@kettle.com', 'billing', now() + interval '7 days',
        ${admin.userId})
    `);

    const exported = await privacyHandlers.export(t.db, admin.userId);
    expect(exported).toMatchObject({
      memberships: [{ orgId: org.orgId, orgName: 'Kettle Ridge Lodge', role: 'admin' }],
      invitationsSent: [{ orgId: org.orgId, email: 'maya@kettle.com', role: 'billing' }],
    });

    await privacyHandlers.erase(t.db, admin.userId);
    await privacyHandlers.erase(t.db, recruiter.userId);
    expect((await membershipRows(org.orgId)).map((m) => m.user_id)).toEqual([org.owner.userId]);
    expect(await queryRows(t.db, sql`select 1 from app.member_assignments`)).toEqual([]);
    expect(
      await queryRows(
        t.db,
        sql`select 1 from app.org_invitations where invited_by = ${admin.userId}`,
      ),
    ).toEqual([]);
  });
});
