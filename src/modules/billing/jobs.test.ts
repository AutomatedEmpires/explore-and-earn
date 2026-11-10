// The billing schedules (Task 16): monthly credits, the retired launch-date job (FD-7), the
// daily reconcile, and the privacy hooks.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { setSetting } from '@/modules/settings';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { FIXED_NOW, seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import type { SubSnapshot } from './gateway';
import { makeFakeBillingGateway, type FakeBillingGateway } from './gateway-fake';
import { jobHandlers, privacyHandlers } from './index';
import { applyLaunchDate, grantMonthlyCredits, reconcile } from './jobs';
import { syncSubscription } from './sync';

const gwHolder = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('./gateway', async (orig) => ({
  ...(await orig<typeof import('./gateway')>()),
  billingGateway: () => gwHolder.current,
}));
vi.mock('@/modules/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/modules/entitlements')>()),
  ...(await import('../../../tests/fakes/sp2/entitlements')).entitlementsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));

const DAY = 86_400_000;
const operatorId = newId();
let t: TestDb;
let gw: FakeBillingGateway;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  entitlementsFake.reset();
  gw = makeFakeBillingGateway();
  gwHolder.current = gw;
  await t.db.execute(sql`delete from app.subscriptions`);
  await t.db.execute(sql`delete from app.settings`);
});

afterEach(() => {
  vi.useRealTimers();
});

const items = (plan: string) => [{ lookupKey: `${plan}_month`, quantity: 1 }];

function stripeSub(org: SeededOrg, o: Partial<SubSnapshot> = {}): SubSnapshot {
  const now = new Date();
  const s: SubSnapshot = {
    id: `sub_jobs_${newId().slice(-10)}`,
    customerId: `cus_jobs_${newId().slice(-8)}`,
    status: 'active',
    items: items('starter'),
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * DAY),
    trialEnd: null,
    cancelAtPeriodEnd: false,
    endedAt: null,
    startDate: now,
    couponId: null,
    metadata: { orgId: org.orgId },
    created: now,
    ...o,
  };
  gw.setSubscription(s);
  return s;
}

async function subscribed(o: Partial<SubSnapshot> = {}) {
  const org = await seedHostOrg(t.db);
  const s = stripeSub(org, o);
  await syncSubscription(t.db, s.id, gw);
  return { org, sub: s };
}

const creditGrants = (orgId: string) =>
  entitlementsFake.grants.filter((g) => g.orgId === orgId && g.kind === 'invite_credit');

async function driftAlerts(): Promise<string[]> {
  const rows = await queryRows<{ data: string }>(
    t.db,
    sql`select data::text from app.audit_events where action = 'trust.alert'`,
  );
  return rows
    .map((r) => JSON.parse(r.data) as { kind: string; data: { subscriptionId?: string } })
    .filter((d) => d.kind === 'billing.drift')
    .map((d) => d.data.subscriptionId ?? '');
}

describe('billing.grant_monthly_credits', () => {
  it("grants each entitled org its plan's credits for the month, once", async () => {
    const { org } = await subscribed();
    const lapsed = await subscribed({ status: 'canceled', endedAt: new Date() });
    entitlementsFake.reset();

    const at = new Date('2026-12-01T00:10:00Z');
    await jobHandlers['billing.grant_monthly_credits']?.({}, { db: t.db, now: at });
    expect(creditGrants(org.orgId).map((g) => [g.quantity, g.validUntil])).toEqual([
      [10, new Date('2027-01-01T00:00:00Z')],
    ]);
    await grantMonthlyCredits(t.db, at);
    expect(creditGrants(org.orgId)).toHaveLength(1);
    expect(creditGrants(lapsed.org.orgId)).toHaveLength(0);
  });

  it('tops up after a mid-month upgrade and never claws back after a downgrade', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
    const { org, sub } = await subscribed();
    expect((await entitlementsFake.getBalance(t.db, org.orgId, 'invite_credit')).balance).toBe(10);

    gw.setSubscription({ ...sub, items: items('professional') });
    await syncSubscription(t.db, sub.id, gw);
    expect(creditGrants(org.orgId).map((g) => g.quantity)).toEqual([10, 40]);
    expect((await entitlementsFake.getBalance(t.db, org.orgId, 'invite_credit')).balance).toBe(50);

    gw.setSubscription({ ...sub, items: items('starter') });
    await syncSubscription(t.db, sub.id, gw);
    expect((await entitlementsFake.getBalance(t.db, org.orgId, 'invite_credit')).balance).toBe(50);
  });
});

describe('billing.apply_launch_date', () => {
  // FD-7 retired the launch-dated free period, so the still-scheduled job does nothing.
  it('moves no trial and calls Stripe for nothing, even with a launch date set', async () => {
    await subscribed({
      status: 'trialing',
      couponId: 'founding_30_forever',
      created: FIXED_NOW,
      trialEnd: new Date(FIXED_NOW.getTime() + 729 * DAY),
      items: items('professional'),
    });
    await setSetting(t.db, 'launch.public_at', '2027-01-15T00:00:00.000Z', { operatorId });
    await expect(
      jobHandlers['billing.apply_launch_date']?.({}, { db: t.db, now: FIXED_NOW }),
    ).resolves.toBeUndefined();
    expect(await applyLaunchDate()).toEqual({ updated: 0, skipped: 0, failed: 0 });
    expect(gw.callsTo('updateSubscription')).toHaveLength(0);
  });
});

describe('billing.reconcile', () => {
  it('resyncs drifted rows and missing subscriptions, and alerts only on drift', async () => {
    const drifted = await subscribed({ status: 'trialing', trialEnd: new Date(Date.now() + 9 * DAY) });
    const steady = await subscribed();
    gw.setSubscription({ ...drifted.sub, status: 'active', trialEnd: null });
    const missingOrg = await seedHostOrg(t.db);
    const missing = stripeSub(missingOrg, { created: new Date(Date.now() - DAY) });

    await jobHandlers['billing.reconcile']?.({}, { db: t.db, now: new Date() });

    const rows = await queryRows<{ stripe_subscription_id: string; status: string }>(
      t.db,
      sql`select stripe_subscription_id, status from app.subscriptions`,
    );
    const status = new Map(rows.map((r) => [r.stripe_subscription_id, r.status]));
    expect(status.get(drifted.sub.id)).toBe('active');
    expect(status.get(missing.id)).toBe('active');
    const alerted = await driftAlerts();
    expect(alerted).toContain(drifted.sub.id);
    expect(alerted).not.toContain(steady.sub.id);

    // Once in step, a second run finds no drift.
    expect(await reconcile(t.db, new Date(), gw)).toMatchObject({ drifted: 0, failed: 0 });
    expect(await driftAlerts()).toHaveLength(alerted.length);
  });
});

describe('privacyHandlers', () => {
  it('exports and then forgets who requested plan changes', async () => {
    const org = await seedHostOrg(t.db);
    await t.db.execute(sql`
      insert into app.billing_changes (id, org_id, to_plan, to_interval, to_extra_slots, status,
        requested_by)
      values (${newId()}, ${org.orgId}, 'starter', 'month', 0, 'applied', ${org.owner.userId})
    `);
    const exported = await privacyHandlers.export(t.db, org.owner.userId);
    expect(exported.billingChanges).toHaveLength(1);
    await privacyHandlers.erase(t.db, org.owner.userId);
    const [row] = await queryRows<{ requested_by: string | null }>(
      t.db,
      sql`select requested_by from app.billing_changes where org_id = ${org.orgId}::uuid`,
    );
    expect(row?.requested_by).toBeNull();
  });
});
