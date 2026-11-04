// Org status, verification status and org settings (SP2 Task 17).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { makeFakeClerkAdmin } from '@/modules/identity';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedMember } from '../../../tests/helpers/sp2';
import {
  getOrgStatus,
  getOrgSummaries,
  setOrgStatus,
  setVerificationStatus,
  updateOrg,
} from './index';

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
      app.organizations, app.users, app.outbox cascade`,
  );
});

const operator = { type: 'operator' as const, id: null };

// Audit rows are append-only (no truncate), so each test reads only its own org's rows.
const auditRows = (orgId: string, action: string) =>
  queryRows<{ org_id: string; actor_type: string; actor_id: string | null; data: unknown }>(
    t.db,
    sql`select org_id, actor_type, actor_id, data from app.audit_events
        where org_id = ${orgId} and action = ${action}`,
  );

const statusEvents = () =>
  queryRows<{ topic: string; payload: { event: string; data: unknown } }>(
    t.db,
    sql`select topic, payload from app.outbox where payload->>'event' = 'org.status_changed'`,
  );

describe('setOrgStatus', () => {
  it('emits one org.status_changed and records orgs.status_changed, once', async () => {
    const org = await seedHostOrg(t.db);

    await setOrgStatus(t.db, org.orgId, 'suspended', operator, 'Fake listings');
    expect(await getOrgStatus(t.db, org.orgId)).toBe('suspended');

    const events = await statusEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.topic).toBe('listings.close_for_org');
    expect(events[0]?.payload.data).toEqual({ orgId: org.orgId, status: 'suspended' });

    const audit = await auditRows(org.orgId, 'orgs.status_changed');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      org_id: org.orgId,
      actor_type: 'operator',
      data: { from: 'active', to: 'suspended', reason: 'Fake listings' },
    });

    await setOrgStatus(t.db, org.orgId, 'suspended', operator, 'Again');
    expect(await statusEvents()).toHaveLength(1);
    expect(await auditRows(org.orgId, 'orgs.status_changed')).toHaveLength(1);
  });

  it('rolls back with the caller', async () => {
    const org = await seedHostOrg(t.db);
    await t.db
      .transaction(async (tx) => {
        await setOrgStatus(tx, org.orgId, 'banned', operator);
        throw new Error('caller failed');
      })
      .catch(() => {});
    expect(await getOrgStatus(t.db, org.orgId)).toBe('active');
    expect(await statusEvents()).toHaveLength(0);
  });

  it('throws not_found for an unknown org', async () => {
    await expect(getOrgStatus(t.db, newId())).rejects.toMatchObject({ code: 'not_found' });
    await expect(setOrgStatus(t.db, newId(), 'banned', operator)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('setVerificationStatus and getOrgSummaries', () => {
  it('stores the status and stamps verified_at when verified', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const at = new Date('2026-11-03T18:00:00Z');

    await setVerificationStatus(t.db, org.orgId, 'running');
    expect((await getOrgSummaries(t.db, [org.orgId])).get(org.orgId)?.verificationStatus).toBe(
      'running',
    );

    await setVerificationStatus(t.db, org.orgId, 'verified', at);
    const summary = (await getOrgSummaries(t.db, [org.orgId, newId()])).get(org.orgId);
    expect(summary).toMatchObject({
      id: org.orgId,
      clerkOrgId: org.clerkOrgId,
      name: 'Kettle Ridge Lodge',
      slug: 'kettle-ridge-lodge',
      status: 'active',
      deleted: false,
      websiteUrl: null,
      requireRecruiterApproval: false,
      primaryLocationId: null,
      verificationStatus: 'verified',
      ownerUserId: org.owner.userId,
    });
    const [row] = await queryRows<{ verified_at: string }>(
      t.db,
      sql`select verified_at from app.organizations where id = ${org.orgId}`,
    );
    expect(new Date(row?.verified_at ?? '').getTime()).toBe(at.getTime());
  });

  it('returns an empty map for no ids', async () => {
    expect((await getOrgSummaries(t.db, [])).size).toBe(0);
  });
});

describe('updateOrg', () => {
  it('rejects a website that is not https', async () => {
    const org = await seedHostOrg(t.db);
    const clerk = makeFakeClerkAdmin();
    await expect(
      updateOrg(t.db, clerk, org.owner.ctx, { websiteUrl: 'http://kettle.com' }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    await expect(
      updateOrg(t.db, clerk, org.owner.ctx, { websiteUrl: 'kettle.com' }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    await expect(updateOrg(t.db, clerk, org.owner.ctx, { name: 'K' })).rejects.toMatchObject({
      code: 'bad_request',
    });
  });

  it('renames in Clerk and records orgs.updated', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const clerk = makeFakeClerkAdmin();

    const summary = await updateOrg(t.db, clerk, admin.ctx, {
      name: '  Kettle Ridge Resort ',
      websiteUrl: 'https://kettle.com',
      requireRecruiterApproval: true,
    });
    expect(summary).toMatchObject({
      name: 'Kettle Ridge Resort',
      websiteUrl: 'https://kettle.com',
      requireRecruiterApproval: true,
      // The slug stays; changing it is its own action.
      slug: 'kettle-ridge-lodge',
    });
    expect(clerk.calls).toEqual([
      { method: 'updateOrganization', args: [org.clerkOrgId, { name: 'Kettle Ridge Resort' }] },
    ]);

    const audit = await auditRows(org.orgId, 'orgs.updated');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      org_id: org.orgId,
      actor_type: 'user',
      actor_id: admin.userId,
      data: {
        changes: {
          name: { from: 'Kettle Ridge Lodge', to: 'Kettle Ridge Resort' },
          websiteUrl: { from: null, to: 'https://kettle.com' },
          requireRecruiterApproval: { from: false, to: true },
        },
      },
    });
  });

  it('changes nothing, in Clerk or the audit log, when nothing differs', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const clerk = makeFakeClerkAdmin();
    await updateOrg(t.db, clerk, org.owner.ctx, { name: 'Kettle Ridge Lodge' });
    expect(clerk.calls).toEqual([]);
    expect(await auditRows(org.orgId, 'orgs.updated')).toHaveLength(0);
  });

  it('a website change alone does not call Clerk, and null clears it', async () => {
    const org = await seedHostOrg(t.db);
    const clerk = makeFakeClerkAdmin();
    await updateOrg(t.db, clerk, org.owner.ctx, { websiteUrl: 'HTTPS://kettle.com/jobs' });
    expect((await getOrgSummaries(t.db, [org.orgId])).get(org.orgId)?.websiteUrl).toBe(
      'https://kettle.com/jobs',
    );
    const cleared = await updateOrg(t.db, clerk, org.owner.ctx, { websiteUrl: null });
    expect(cleared.websiteUrl).toBeNull();
    expect(clerk.calls).toEqual([]);
  });

  it('leaves everything unchanged when Clerk fails', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const clerk = makeFakeClerkAdmin();
    clerk.failNext('updateOrganization');
    await expect(
      updateOrg(t.db, clerk, org.owner.ctx, { name: 'Kettle Ridge Resort' }),
    ).rejects.toThrow('fake Clerk');
    expect((await getOrgSummaries(t.db, [org.orgId])).get(org.orgId)?.name).toBe(
      'Kettle Ridge Lodge',
    );
    expect(await auditRows(org.orgId, 'orgs.updated')).toHaveLength(0);
  });

  it('is for Owners and Admins only', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    await expect(
      updateOrg(t.db, makeFakeClerkAdmin(), recruiter.ctx, { requireRecruiterApproval: true }),
    ).rejects.toMatchObject({ code: 'forbidden', details: { reason: 'role_not_allowed' } });
  });
});
