// Immediate cancellation, sanctions and card checks (Task 15).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { decide, openReviewItem } from '@/modules/trust';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import { cancelSubscriptionNow, getCardChecks, sanctionOrg } from './cancel';
import type { SubSnapshot } from './gateway';
import { makeFakeBillingGateway, type FakeBillingGateway } from './gateway-fake';
import { getSubscriptionState } from './state';
import { syncSubscription } from './sync';
import { jobHandlers } from './index';

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

let t: TestDb;
let gw: FakeBillingGateway;
let org: SeededOrg;
let operatorId: string;

beforeAll(async () => {
  t = await createTestDb();
  operatorId = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${operatorId}, ${`user_${operatorId}`}, 'ops@ops.test', 'Ops', 'operator')
  `);
  await t.db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (${operatorId}, 'owner', '{}'::text[], 'on_shift')
  `);
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  entitlementsFake.reset();
  gw = makeFakeBillingGateway();
  gwHolder.current = gw;
  org = await seedHostOrg(t.db);
});

async function subscribe(): Promise<SubSnapshot> {
  const { id: customerId } = await gw.createCustomer(
    { orgId: org.orgId, name: 'Kettle', email: null },
    `customer:${org.orgId}`,
  );
  await t.db.execute(sql`
    insert into app.billing_accounts (org_id, stripe_customer_id) values (${org.orgId}, ${customerId})
  `);
  const now = new Date();
  const sub: SubSnapshot = {
    id: `sub_cancel_${newId().slice(-10)}`,
    customerId,
    status: 'active',
    items: [{ lookupKey: 'professional_month', quantity: 1 }],
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
    trialEnd: null,
    cancelAtPeriodEnd: false,
    endedAt: null,
    startDate: now,
    activatedAt: now,
    couponId: null,
    metadata: { orgId: org.orgId },
    created: now,
  };
  gw.setSubscription(sub);
  await syncSubscription(t.db, sub.id, gw);
  return sub;
}

async function orgStatus(orgId = org.orgId) {
  const [row] = await queryRows<{ status: string }>(
    t.db,
    sql`select status from app.organizations where id = ${orgId}::uuid`,
  );
  return row?.status;
}

async function cancelJobs(orgId = org.orgId) {
  return queryRows<{ payload: string }>(
    t.db,
    sql`select payload::text from app.outbox where dedupe_key = ${`cancel:${orgId}:ban`}`,
  );
}

const operator = { type: 'operator' as const, id: null };

describe('sanctionOrg', () => {
  it('bans the org and queues its subscription for cancellation, which lapses it', async () => {
    const sub = await subscribe();
    await sanctionOrg(t.db, org.orgId, 'ban', operator);
    expect(await orgStatus()).toBe('banned');
    const jobs = await cancelJobs();
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0]?.payload ?? '{}')).toEqual({ orgId: org.orgId });

    await jobHandlers['billing.cancel_subscription']?.(JSON.parse(jobs[0]?.payload ?? '{}'), {
      db: t.db,
      now: new Date(),
    });
    expect(gw.callsTo('cancelSubscription')).toEqual([[sub.id, `cancel:${sub.id}`]]);
    expect(await getSubscriptionState(t.db, org.orgId)).toMatchObject({
      status: 'canceled',
      entitled: false,
      hostSince: null,
    });
  });

  it('only sets the status for a suspension', async () => {
    await subscribe();
    await sanctionOrg(t.db, org.orgId, 'suspend', operator);
    expect(await orgStatus()).toBe('suspended');
    expect(await cancelJobs()).toHaveLength(0);
    expect((await getSubscriptionState(t.db, org.orgId)).status).toBe('active');
  });

  it('runs when an operator suspends from a billing item', async () => {
    const { id } = await openReviewItem(t.db, {
      queue: 'billing',
      subjectType: 'billing_account',
      subjectId: org.orgId,
      reason: 'unknown_price',
    });
    await decide(t.db, id, operatorId, 'suspend');
    expect(await orgStatus()).toBe('suspended');
  });
});

describe('cancelSubscriptionNow', () => {
  it('does nothing without a current subscription', async () => {
    await cancelSubscriptionNow(t.db, org.orgId, gw);
    expect(gw.callsTo('cancelSubscription')).toHaveLength(0);
  });
});

describe('getCardChecks', () => {
  it("reports the default card's checks, or no card without a customer", async () => {
    expect(await getCardChecks(t.db, org.orgId, gw)).toEqual({
      hasCard: false,
      cvcCheck: null,
      postalCheck: null,
    });
    const sub = await subscribe();
    gw.setCardChecks(sub.customerId, { hasCard: true, cvcCheck: 'fail', postalCheck: 'pass' });
    expect(await getCardChecks(t.db, org.orgId, gw)).toEqual({
      hasCard: true,
      cvcCheck: 'fail',
      postalCheck: 'pass',
    });
  });
});
