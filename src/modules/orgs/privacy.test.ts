import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { makeFakeClerkAdmin } from '@/modules/identity';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedListingRow } from '@tests/helpers/sp2';
import { seedHostOrg, seedMember, seedSeeker } from '@tests/helpers/sp8';
import { closeOrganization, deleteClerkOrgJob, eraseMembership } from './close';
import { privacyHandler } from './privacy';

const NOW = new Date('2026-11-18T12:00:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const erase = (s: PrivacySubject, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));

const memberships = (userId: string) =>
  queryRows<{ org_id: string; removed: boolean }>(
    t.db,
    sql`select org_id::text, deleted_at is not null as removed
        from app.org_memberships where user_id = ${userId}`,
  );

async function invite(o: { orgId: string; email: string; invitedBy?: string; acceptedBy?: string }) {
  const id = newId();
  await t.db.execute(sql`
    insert into app.org_invitations (id, org_id, email, role, expires_at, invited_by,
      accepted_user_id, status)
    values (${id}, ${o.orgId}, ${o.email}, 'recruiter', now() + interval '7 days',
      ${o.invitedBy ?? null}, ${o.acceptedBy ?? null}, ${o.acceptedBy ? 'accepted' : 'pending'})
  `);
  return id;
}

const invitation = async (id: string) =>
  (
    await queryRows<{ invited_by: string | null }>(
      t.db,
      sql`select invited_by::text from app.org_invitations where id = ${id}`,
    )
  )[0];

const removedEvents = (userId: string) =>
  queryRows<{ payload: { data: { orgId: string; userId: string; reassignToUserId: string } } }>(
    t.db,
    sql`select payload from app.outbox
        where payload->>'event' = 'org.member_removed' and payload->'data'->>'userId' = ${userId}`,
  );

describe('orgs privacy handler: a person', () => {
  it('removes a member, hands their work to the Owner, and leaves no row naming them', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const listingId = await seedListingRow(t.db, { orgId: org.orgId });
    await t.db.execute(sql`
      insert into app.member_assignments (id, membership_id, listing_id)
      values (${newId()}, ${recruiter.membershipId}, ${listingId})
    `);
    await t.db.execute(
      sql`update app.org_memberships set invited_by = ${recruiter.userId} where id = ${admin.membershipId}`,
    );
    const otherOrg = await seedHostOrg(t.db, { name: 'Pine Hollow Ranch' });
    const toThem = await invite({ orgId: otherOrg.orgId, email: recruiter.email });
    const accepted = await invite({
      orgId: org.orgId,
      email: 'old-address@kettle.test',
      acceptedBy: recruiter.userId,
    });
    const sentByThem = await invite({
      orgId: org.orgId,
      email: 'newcomer@kettle.test',
      invitedBy: recruiter.userId,
    });
    const subject = { kind: 'user' as const, userId: recruiter.userId };

    const first = await erase(subject);
    expect(first.retained).toEqual([]);
    expect(first.erased).toBeGreaterThan(0);

    const events = await removedEvents(recruiter.userId);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload.data).toEqual({
      orgId: org.orgId,
      userId: recruiter.userId,
      reassignToUserId: org.owner.userId,
    });
    expect(await memberships(recruiter.userId)).toEqual([]);
    expect(
      await queryRows(
        t.db,
        sql`select 1 from app.member_assignments where membership_id = ${recruiter.membershipId}`,
      ),
    ).toEqual([]);
    expect(await invitation(toThem)).toBeUndefined();
    expect(await invitation(accepted)).toBeUndefined();
    expect(await invitation(sentByThem)).toEqual({ invited_by: null });
    const [adminRow] = await queryRows<{ invited_by: string | null; removed: boolean }>(
      t.db,
      sql`select invited_by::text, deleted_at is not null as removed
          from app.org_memberships where id = ${admin.membershipId}`,
    );
    expect(adminRow).toEqual({ invited_by: null, removed: false });
    expect(await memberships(org.owner.userId)).toEqual([{ org_id: org.orgId, removed: false }]);
    const audit = await queryRows<{ data: unknown }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'orgs.member_removed' and subject_id = ${recruiter.membershipId}`,
    );
    expect(audit).toEqual([{ data: { reason: 'account_deleted', role: 'recruiter' } }]);

    expect(await erase(subject)).toEqual({ erased: 0, retained: [] });
    expect(await removedEvents(recruiter.userId)).toHaveLength(1);
  });

  it('erases nothing under a hold on everything and lists what it kept', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    const sent = await invite({
      orgId: org.orgId,
      email: 'someone@kettle.test',
      invitedBy: recruiter.userId,
    });
    const subject = { kind: 'user' as const, userId: recruiter.userId };

    const held = await erase(subject, ['all']);
    expect(held).toEqual({
      erased: 0,
      retained: [
        { table: 'org_memberships', reason: 'legal_hold', until: null },
        { table: 'org_invitations', reason: 'legal_hold', until: null },
      ],
    });
    expect(await memberships(recruiter.userId)).toEqual([{ org_id: org.orgId, removed: false }]);
    expect(await invitation(sent)).toEqual({ invited_by: recruiter.userId });
    expect(await removedEvents(recruiter.userId)).toEqual([]);
  });

  it('exports memberships and sent invitations without the invitee address', async () => {
    const org = await seedHostOrg(t.db, { name: 'Cedar Point Camp' });
    const admin = await seedMember(t.db, org.orgId, 'admin');
    await invite({ orgId: org.orgId, email: 'invitee@elsewhere.test', invitedBy: admin.userId });

    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId: admin.userId });
    expect(part.records.memberships).toEqual([
      expect.objectContaining({ orgName: 'Cedar Point Camp', role: 'admin' }),
    ]);
    expect(part.records.invitationsSent).toEqual([
      expect.objectContaining({ role: 'recruiter', status: 'pending' }),
    ]);
    expect(JSON.stringify(part)).not.toContain('invitee@elsewhere.test');
    expect(JSON.stringify(part)).not.toContain(org.owner.email);
  });
});

describe('orgs privacy handler: an organization', () => {
  it('closes it once, queues the cancellation and the Clerk deletion, and keeps the row', async () => {
    const org = await seedHostOrg(t.db);
    const bystander = await seedHostOrg(t.db, { name: 'Untouched Outfitters' });
    await invite({ orgId: org.orgId, email: 'pending@kettle.test' });
    const subject = { kind: 'org' as const, orgId: org.orgId };

    const first = await erase(subject);
    expect(first.erased).toBeGreaterThan(0);
    expect(first.retained).toEqual(
      expect.arrayContaining([
        { table: 'organizations', reason: 'shared_record', until: null },
        { table: 'org_slugs', reason: 'shared_record', until: null },
      ]),
    );
    const [closed] = await queryRows<{ deleted: boolean; owner_user_id: string | null }>(
      t.db,
      sql`select deleted_at is not null as deleted, owner_user_id::text
          from app.organizations where id = ${org.orgId}`,
    );
    expect(closed).toEqual({ deleted: true, owner_user_id: null });
    const keys = await queryRows<{ dedupe_key: string; payload: unknown }>(
      t.db,
      sql`select dedupe_key, payload from app.outbox
          where dedupe_key in (${`cancel:${org.orgId}:close`}, ${`clerk_org_delete:${org.orgId}`})
          order by dedupe_key`,
    );
    expect(keys).toEqual([
      { dedupe_key: `cancel:${org.orgId}:close`, payload: { orgId: org.orgId } },
      { dedupe_key: `clerk_org_delete:${org.orgId}`, payload: { clerkOrgId: org.clerkOrgId } },
    ]);
    expect(await memberships(org.owner.userId)).toEqual([{ org_id: org.orgId, removed: true }]);
    expect(
      await queryRows(t.db, sql`select 1 from app.org_invitations where org_id = ${org.orgId}`),
    ).toEqual([]);
    const audit = await queryRows<{ data: unknown }>(
      t.db,
      sql`select data from app.audit_events where action = 'orgs.deleted' and org_id = ${org.orgId}`,
    );
    expect(audit).toEqual([{ data: { reason: 'account_deleted' } }]);

    const outboxBefore = await queryRows(t.db, sql`select 1 from app.outbox`);
    expect(
      await closeOrganization(t.db, { orgId: org.orgId, actorUserId: null, reason: 'again' }),
    ).toEqual({ closed: false });
    expect(await erase(subject)).toEqual({ erased: 0, retained: first.retained });
    expect(await queryRows(t.db, sql`select 1 from app.outbox`)).toHaveLength(outboxBefore.length);

    const [other] = await queryRows<{ deleted: boolean }>(
      t.db,
      sql`select deleted_at is not null as deleted from app.organizations
          where id = ${bystander.orgId}`,
    );
    expect(other).toEqual({ deleted: false });
  });

  it('leaves no membership row for a sole Owner once both subjects ran', async () => {
    const org = await seedHostOrg(t.db);
    await erase({ kind: 'org', orgId: org.orgId });
    await erase({ kind: 'user', userId: org.owner.userId });
    expect(await memberships(org.owner.userId)).toEqual([]);
    // No org.member_removed for an Owner: there is nobody to hand the work to.
    expect(await removedEvents(org.owner.userId)).toEqual([]);
  });

  it('stays open under a hold on everything', async () => {
    const org = await seedHostOrg(t.db);
    const held = await erase({ kind: 'org', orgId: org.orgId }, ['all']);
    expect(held.erased).toBe(0);
    expect(held.retained.length).toBeGreaterThan(0);
    expect(held.retained.every((r) => r.reason === 'legal_hold')).toBe(true);
    const [row] = await queryRows<{ deleted: boolean }>(
      t.db,
      sql`select deleted_at is not null as deleted from app.organizations where id = ${org.orgId}`,
    );
    expect(row).toEqual({ deleted: false });
    expect(
      await queryRows(
        t.db,
        sql`select 1 from app.outbox where dedupe_key = ${`cancel:${org.orgId}:close`}`,
      ),
    ).toEqual([]);
  });
});

describe('eraseMembership and orgs.delete_clerk_org', () => {
  it('never removes an Owner, and reports when nothing is live', async () => {
    const org = await seedHostOrg(t.db);
    const stranger = await seedSeeker(t.db);
    expect(
      await eraseMembership(t.db, { orgId: org.orgId, userId: org.owner.userId, reason: 'x' }),
    ).toEqual({ removed: false });
    expect(
      await eraseMembership(t.db, { orgId: org.orgId, userId: stranger.userId, reason: 'x' }),
    ).toEqual({ removed: false });
    const billing = await seedMember(t.db, org.orgId, 'billing');
    expect(
      await eraseMembership(t.db, { orgId: org.orgId, userId: billing.userId, reason: 'x' }),
    ).toEqual({ removed: true });
    expect(
      await eraseMembership(t.db, { orgId: org.orgId, userId: billing.userId, reason: 'x' }),
    ).toEqual({ removed: false });
  });

  it('deletes the Clerk organization, and treats one already gone as done', async () => {
    const clerk = makeFakeClerkAdmin();
    await deleteClerkOrgJob({ clerkOrgId: 'org_abc' }, { clerk });
    expect(clerk.calls).toEqual([{ method: 'deleteOrganization', args: ['org_abc'] }]);

    clerk.failNext('deleteOrganization', Object.assign(new Error('not found'), { status: 404 }));
    await expect(deleteClerkOrgJob({ clerkOrgId: 'org_abc' }, { clerk })).resolves.toBeUndefined();
    clerk.failNext('deleteOrganization', Object.assign(new Error('down'), { status: 503 }));
    await expect(deleteClerkOrgJob({ clerkOrgId: 'org_abc' }, { clerk })).rejects.toThrow('down');
    await expect(deleteClerkOrgJob({}, { clerk })).rejects.toThrow();
  });
});
