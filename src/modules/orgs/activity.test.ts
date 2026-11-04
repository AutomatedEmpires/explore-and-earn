// The team activity log (SP2 Task 19, spec section 6): the org's own audit rows, labeled.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { record } from '@/modules/audit';
import { makeFakeClerkAdmin } from '@/modules/identity';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { seedHostOrg, seedMember } from '../../../tests/helpers/sp2';
import { changeMember, changeSlug, createInvitation, listActivity, updateOrg } from './index';

vi.mock('@/modules/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/modules/entitlements')>()),
  ...(await import('../../../tests/fakes/sp2/entitlements')).entitlementsFake,
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
});

describe('listActivity', () => {
  it("lists the org's team, page and listing actions, with who did them", async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const other = await seedHostOrg(t.db, { name: 'Other Lodge' });
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    const clerk = makeFakeClerkAdmin();

    await updateOrg(t.db, clerk, org.owner.ctx, { websiteUrl: 'https://kettle.com' });
    await createInvitation(t.db, org.owner.ctx, { email: 'maya@kettle.com', role: 'admin' });
    await changeMember(t.db, clerk, org.owner.ctx, recruiter.membershipId, { role: 'billing' });
    await changeSlug(t.db, org.owner.ctx, 'kettle-ridge');
    // Billing is a fake here, so its rows are written directly, as billing writes them.
    await record(t.db, {
      actorType: 'user',
      actorId: org.owner.userId,
      orgId: org.orgId,
      action: 'billing.checkout_started',
      subjectType: 'organization',
      subjectId: org.orgId,
    });
    await record(t.db, {
      actorType: 'system',
      actorId: null,
      orgId: org.orgId,
      action: 'billing.plan_changed',
      subjectType: 'organization',
      subjectId: org.orgId,
      data: { toPlan: 'starter' },
    });
    await record(t.db, {
      actorType: 'operator',
      actorId: null,
      orgId: org.orgId,
      action: 'orgs.status_changed',
      subjectType: 'organization',
      subjectId: org.orgId,
      data: { from: 'active', to: 'suspended' },
    });
    // Another org's row never shows.
    await updateOrg(t.db, clerk, other.owner.ctx, { websiteUrl: 'https://other.com' });

    const { items, nextBefore } = await listActivity(t.db, org.owner.ctx);
    expect(nextBefore).toBeNull();
    expect(items.map((i) => i.action)).toEqual([
      'orgs.status_changed',
      'billing.plan_changed',
      'orgs.slug_changed',
      'orgs.member_changed',
      'orgs.member_invited',
      'orgs.updated',
    ]);
    expect(items.map((i) => i.actorLabel)).toEqual([
      'Explore&Earn',
      'Explore&Earn (automatic)',
      'Sam Rivera',
      'Sam Rivera',
      'Sam Rivera',
      'Sam Rivera',
    ]);
    expect(items.map((i) => i.summary)).toEqual([
      'Suspended the organization',
      'Changed the plan',
      'Changed the host page address to /hosts/kettle-ridge',
      "Changed A recruiter's role to Billing",
      'Invited maya@kettle.com as an Admin',
      "Changed the organization's website",
    ]);
    for (const item of items) expect(item.at).toBeInstanceOf(Date);
  });

  it('pages 50 at a time', async () => {
    const org = await seedHostOrg(t.db);
    for (let n = 0; n < 51; n++) {
      await record(t.db, {
        actorType: 'user',
        actorId: org.owner.userId,
        orgId: org.orgId,
        action: 'orgs.updated',
        subjectType: 'organization',
        subjectId: org.orgId,
        data: { changes: { name: { from: `${n}`, to: `${n + 1}` } } },
      });
    }
    const first = await listActivity(t.db, org.owner.ctx);
    expect(first.items).toHaveLength(50);
    expect(first.nextBefore).not.toBeNull();
    const second = await listActivity(t.db, org.owner.ctx, first.nextBefore ?? undefined);
    expect(second.items).toHaveLength(1);
    expect(second.nextBefore).toBeNull();
  });

  it('is for Owners and Admins only', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    await expect(listActivity(t.db, recruiter.ctx)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
