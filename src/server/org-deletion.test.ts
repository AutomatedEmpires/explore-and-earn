// Deleting a host organization (SP2 Task 19, spec section 8.1): confirm by name, cancel billing,
// close every listing, then soft-delete the org and delete it in Clerk. Billing and listings are
// the W0 fakes; orgs is real.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { makeFakeClerkAdmin } from '@/modules/identity';
import { billingFake } from '../../tests/fakes/sp2/billing';
import { listingsFake } from '../../tests/fakes/sp2/listings';
import { createTestDb, type TestDb } from '../../tests/helpers/db';
import { seedHostOrg, seedMember } from '../../tests/helpers/sp2';
import { deleteHostOrganization } from './org-deletion';

vi.mock('@/modules/billing', async (orig) => {
  const { billingFake: fake } = await import('../../tests/fakes/sp2/billing');
  return {
    ...(await orig<typeof import('@/modules/billing')>()),
    ...fake,
    // Late-bound, so a test can make it fail with vi.spyOn(billingFake, ...).
    cancelSubscriptionNow: (...args: Parameters<typeof fake.cancelSubscriptionNow>) =>
      fake.cancelSubscriptionNow(...args),
  };
});
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('../../tests/fakes/sp2/listings')).listingsFake,
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  vi.restoreAllMocks();
  billingFake.reset();
  listingsFake.reset();
});

const deletedAt = async (orgId: string) => {
  const [row] = await queryRows<{ deleted_at: string | null }>(
    t.db,
    sql`select deleted_at from app.organizations where id = ${orgId}`,
  );
  return row?.deleted_at ?? null;
};

describe('deleteHostOrganization', () => {
  it('refuses a name that does not match, and touches nothing', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const clerk = makeFakeClerkAdmin();
    await expect(
      deleteHostOrganization(t.db, clerk, org.owner.ctx, 'Kettle Ridge'),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'confirm_name_mismatch' } });
    expect(billingFake.calls).toEqual([]);
    expect(listingsFake.calls).toEqual([]);
    expect(clerk.calls).toEqual([]);
    expect(await deletedAt(org.orgId)).toBeNull();
  });

  it('cancels billing, closes listings, then deletes the org here and in Clerk', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const clerk = makeFakeClerkAdmin();

    await expect(
      deleteHostOrganization(t.db, clerk, org.owner.ctx, '  kettle ridge LODGE '),
    ).resolves.toEqual({ redirectTo: '/onboarding' });

    expect(billingFake.callsTo('cancelSubscriptionNow')).toEqual([[org.orgId]]);
    expect(listingsFake.calls).toEqual([{ name: 'closeAllForOrg', args: [org.orgId, 'host'] }]);
    expect(await deletedAt(org.orgId)).not.toBeNull();
    expect(clerk.calls).toEqual([{ method: 'deleteOrganization', args: [org.clerkOrgId] }]);
    const audit = await queryRows<{ actor_id: string }>(
      t.db,
      sql`select actor_id from app.audit_events
          where org_id = ${org.orgId} and action = 'orgs.deleted'`,
    );
    expect(audit).toEqual([{ actor_id: org.owner.userId }]);
  });

  it('deletes nothing when cancelling the subscription fails', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const clerk = makeFakeClerkAdmin();
    vi.spyOn(billingFake, 'cancelSubscriptionNow').mockRejectedValueOnce(new Error('Stripe down'));

    await expect(
      deleteHostOrganization(t.db, clerk, org.owner.ctx, 'Kettle Ridge Lodge'),
    ).rejects.toThrow('Stripe down');
    expect(listingsFake.calls).toEqual([]);
    expect(clerk.calls).toEqual([]);
    expect(await deletedAt(org.orgId)).toBeNull();
  });

  it('keeps the org when Clerk refuses to delete it', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const clerk = makeFakeClerkAdmin();
    clerk.failNext('deleteOrganization');
    await expect(
      deleteHostOrganization(t.db, clerk, org.owner.ctx, 'Kettle Ridge Lodge'),
    ).rejects.toThrow('fake Clerk');
    expect(await deletedAt(org.orgId)).toBeNull();
  });

  it('is for the Owner only', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const admin = await seedMember(t.db, org.orgId, 'admin');
    await expect(
      deleteHostOrganization(t.db, makeFakeClerkAdmin(), admin.ctx, 'Kettle Ridge Lodge'),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(billingFake.calls).toEqual([]);
  });
});
