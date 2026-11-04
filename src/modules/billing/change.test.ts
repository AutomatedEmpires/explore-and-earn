// Plan changes with a stored keep list, and the Billing Portal (Task 15). The slot holders come
// from the registered source (listings registers the real one).
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { newId } from '@/lib/ids';
import { requireHost } from '@/server/guards';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedMember, type SeededOrg } from '../../../tests/helpers/sp2';
import {
  changePlan,
  getPendingKeepList,
  previewChange,
  registerSlotHolderSource,
  settlePendingChange,
} from './change';
import type { SubSnapshot, SubscriptionUpdate } from './gateway';
import { makeFakeBillingGateway, type FakeBillingGateway } from './gateway-fake';
import { createPortalSession } from './portal';
import { getSubscriptionState } from './state';
import { syncSubscription } from './sync';

const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
const gwHolder = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('@/lib/db', async (orig) => ({
  ...(await orig<typeof import('@/lib/db')>()),
  getDb: () => {
    if (!dbHolder.current) throw new Error('test db not ready');
    return dbHolder.current;
  },
}));
vi.mock('./gateway', async (orig) => ({
  ...(await orig<typeof import('./gateway')>()),
  billingGateway: () => gwHolder.current,
}));
vi.mock('@/server/guards', () => ({
  requireUser: vi.fn(),
  requireSeeker: vi.fn(),
  requireHost: vi.fn(),
  requireOperator: vi.fn(),
}));
vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
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
let sub: SubSnapshot;
let holders: string[] = [];

registerSlotHolderSource(async () => holders);

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

const items = (plan: string, extra = 0) => [
  { lookupKey: `${plan}_month`, quantity: 1 },
  ...(extra > 0 ? [{ lookupKey: `slot_${plan}_month`, quantity: extra }] : []),
];

/** The org on `plan`, synced from the fake, with a Stripe customer. */
async function subscribe(plan: string, extra = 0) {
  const { id: customerId } = await gw.createCustomer(
    { orgId: org.orgId, name: 'Kettle', email: null },
    `customer:${org.orgId}`,
  );
  await t.db.execute(sql`
    insert into app.billing_accounts (org_id, stripe_customer_id) values (${org.orgId}, ${customerId})
  `);
  const now = new Date();
  sub = {
    id: `sub_change_${newId().slice(-10)}`,
    customerId,
    status: 'active',
    items: items(plan, extra),
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
    trialEnd: null,
    cancelAtPeriodEnd: false,
    endedAt: null,
    startDate: now,
    couponId: null,
    metadata: { orgId: org.orgId },
    created: now,
  };
  gw.setSubscription(sub);
  await syncSubscription(t.db, sub.id, gw);
}

beforeEach(async () => {
  entitlementsFake.reset();
  gw = makeFakeBillingGateway();
  gwHolder.current = gw;
  org = await seedHostOrg(t.db);
  holders = [newId(), newId(), newId()];
  entitlementsFake.setUsed(org.orgId, 'listing_slot', 3);
  entitlementsFake.setUsed(org.orgId, 'seat', 1);
  await subscribe('professional');
});

const toStarter = (keepListingIds?: string[]) => ({
  orgId: org.orgId,
  plan: 'starter' as const,
  interval: 'month' as const,
  extraSlots: 0,
  keepListingIds,
  actorUserId: org.owner.userId,
});

async function changeRows() {
  return queryRows<{ status: string; keep_listing_ids: string[] | null; error: string | null }>(
    t.db,
    sql`select status, keep_listing_ids, error from app.billing_changes
        where org_id = ${org.orgId}::uuid order by created_at`,
  );
}

async function changedEvents() {
  return (
    await queryRows(
      t.db,
      sql`select 1 from app.outbox where topic = 'listings.enforce_slot_limit'
          and payload::text like ${`%${org.orgId}%`}`,
    )
  ).length;
}

describe('previewChange', () => {
  it('reports the new limits and how many listings must be chosen', async () => {
    const preview = await previewChange(t.db, org.orgId, {
      plan: 'starter',
      interval: 'month',
      extraSlots: 0,
    }, gw);
    expect(preview).toMatchObject({
      mustChooseListings: 1,
      newLimits: { listingSlots: 2, seats: 1, inviteCredits: 10 },
      dueNowCents: 0,
      nextInvoiceCents: 9900,
    });
    const [args] = gw.callsTo('previewInvoice')[0] ?? [];
    expect(args).toMatchObject({ subscriptionId: sub.id, prorationBehavior: 'create_prorations' });
  });
});

describe('changePlan', () => {
  it('needs a valid keep list when listings exceed the new limit', async () => {
    for (const keep of [undefined, holders, [holders[0] ?? '', newId()]]) {
      await expect(changePlan(t.db, toStarter(keep), gw)).rejects.toMatchObject({
        code: 'bad_request',
        details: { reason: 'keep_list_required' },
      });
    }
    expect(gw.callsTo('updateSubscription')).toHaveLength(0);
    expect(await changeRows()).toEqual([]);
  });

  it('refuses a plan with fewer seats than members, before calling Stripe', async () => {
    await seedMember(t.db, org.orgId, 'admin');
    await seedMember(t.db, org.orgId, 'recruiter');
    entitlementsFake.setUsed(org.orgId, 'seat', 3);
    await expect(changePlan(t.db, toStarter(holders.slice(0, 2)), gw)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'seat_limit' },
    });
    expect(gw.callsTo('updateSubscription')).toHaveLength(0);
  });

  it('stores the pending keep list before calling Stripe, keyed by the change', async () => {
    const keep = holders.slice(1);
    let seen: Awaited<ReturnType<typeof changeRows>> = [];
    gw.hooks.updateSubscription = async () => {
      seen = await changeRows();
    };
    const result = await changePlan(t.db, toStarter(keep), gw);
    expect(result.status).toBe('applied');
    expect(result.subscription).toMatchObject({ plan: 'starter', interval: 'month' });
    expect(seen).toEqual([{ status: 'pending', keep_listing_ids: keep, error: null }]);

    const [id, update, key] = gw.callsTo('updateSubscription')[0] ?? [];
    const [change] = await queryRows<{ id: string }>(
      t.db,
      sql`select id from app.billing_changes where org_id = ${org.orgId}::uuid`,
    );
    expect(id).toBe(sub.id);
    expect(key).toBe(`change:${change?.id}`);
    expect(update).toEqual({
      items: [{ lookupKey: 'starter_month', quantity: 1 }],
      prorationBehavior: 'create_prorations',
    });
    // Still pending until listings has enforced it (SP2 plan, decision 2).
    expect((await changeRows())[0]?.status).toBe('pending');

    const [audit] = await queryRows<{ data: string }>(
      t.db,
      sql`select data::text from app.audit_events
          where action = 'billing.plan_changed' and org_id = ${org.orgId}::uuid`,
    );
    expect(JSON.parse(audit?.data ?? '{}')).toMatchObject({
      changeId: change?.id,
      from: { plan: 'professional', interval: 'month', extraSlots: 0 },
      to: { plan: 'starter', interval: 'month', extraSlots: 0 },
      status: 'applied',
    });
  });

  it('charges an upgrade at once, and refuses it if the card is declined', async () => {
    const up = { ...toStarter(), plan: 'enterprise' as const };
    gw.declineNextUpdate();
    const before = await changedEvents();
    const failed = await changePlan(t.db, up, gw);
    expect(failed.status).toBe('failed');
    expect(failed.subscription.plan).toBe('professional');
    expect((await changeRows()).at(-1)).toMatchObject({ status: 'failed' });
    expect((await changeRows()).at(-1)?.error).toContain('declined');
    expect(await changedEvents()).toBe(before);

    const applied = await changePlan(t.db, up, gw);
    expect(applied.status).toBe('applied');
    const [, update] = gw.callsTo('updateSubscription').at(-1) ?? [];
    expect(update as SubscriptionUpdate).toMatchObject({
      prorationBehavior: 'always_invoice',
      paymentBehavior: 'error_if_incomplete',
    });
  });

  it('upgrades Starter to Professional with always_invoice', async () => {
    entitlementsFake.setUsed(org.orgId, 'listing_slot', 2);
    await changePlan(t.db, toStarter(), gw);
    await settlePendingChange(t.db, org.orgId);
    await changePlan(t.db, { ...toStarter(), plan: 'professional' }, gw);
    const [, update] = gw.callsTo('updateSubscription').at(-1) ?? [];
    expect(update as SubscriptionUpdate).toMatchObject({
      prorationBehavior: 'always_invoice',
      paymentBehavior: 'error_if_incomplete',
    });
  });

  it('keeps the keep list until settled, and allows one pending change at a time', async () => {
    const keep = holders.slice(0, 2);
    await changePlan(t.db, toStarter(keep), gw);
    expect(await getPendingKeepList(t.db, org.orgId)).toEqual(keep);
    await expect(
      changePlan(t.db, { ...toStarter(), plan: 'enterprise' }, gw),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'change_in_progress' } });

    await settlePendingChange(t.db, org.orgId);
    expect(await getPendingKeepList(t.db, org.orgId)).toBeNull();
    expect((await changeRows())[0]?.status).toBe('applied');
  });

  it('carries extra slots over to the new tier', async () => {
    org = await seedHostOrg(t.db);
    await subscribe('professional', 2);
    await changePlan(
      t.db,
      { ...toStarter(), plan: 'enterprise', extraSlots: 2 },
      gw,
    );
    const [, update] = gw.callsTo('updateSubscription').at(-1) ?? [];
    expect((update as SubscriptionUpdate).items).toEqual([
      { lookupKey: 'enterprise_month', quantity: 1 },
      { lookupKey: 'slot_enterprise_month', quantity: 2 },
    ]);
    expect(await getSubscriptionState(t.db, org.orgId)).toMatchObject({
      plan: 'enterprise',
      extraSlots: 2,
    });
  });

  it('refuses a change to the plan the org already has', async () => {
    await expect(
      changePlan(t.db, { ...toStarter(), plan: 'professional' }, gw),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'no_change' } });
  });

  it('changes nothing when Stripe is down', async () => {
    gw.failNext('updateSubscription');
    await expect(
      changePlan(t.db, { ...toStarter(), plan: 'enterprise' }, gw),
    ).rejects.toMatchObject({
      code: 'internal',
      message: 'Billing is temporarily unavailable. Try again in a few minutes.',
    });
    expect((await getSubscriptionState(t.db, org.orgId)).plan).toBe('professional');
    expect(await getPendingKeepList(t.db, org.orgId)).toBeNull();
  });
});

describe('createPortalSession', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_PORTAL_CONFIG_FULL = 'bpc_full_test';
    process.env.STRIPE_PORTAL_CONFIG_BILLING = 'bpc_billing_test';
    resetEnvCache();
  });

  afterEach(() => {
    process.env.STRIPE_PORTAL_CONFIG_FULL = env.STRIPE_PORTAL_CONFIG_FULL;
    process.env.STRIPE_PORTAL_CONFIG_BILLING = env.STRIPE_PORTAL_CONFIG_BILLING;
    if (env.STRIPE_PORTAL_CONFIG_FULL === undefined) delete process.env.STRIPE_PORTAL_CONFIG_FULL;
    if (env.STRIPE_PORTAL_CONFIG_BILLING === undefined) {
      delete process.env.STRIPE_PORTAL_CONFIG_BILLING;
    }
    resetEnvCache();
  });

  it('gives Owners the full configuration and Billing members invoices only', async () => {
    const billing = await seedMember(t.db, org.orgId, 'billing');
    expect((await createPortalSession(t.db, org.owner.ctx, gw)).url).toContain('billing.stripe.test');
    await createPortalSession(t.db, billing.ctx, gw);
    const configs = gw
      .callsTo('createPortalSession')
      .map(([i]) => (i as { configurationId: string; returnUrl: string }));
    expect(configs.map((c) => c.configurationId)).toEqual(['bpc_full_test', 'bpc_billing_test']);
    expect(configs[0]?.returnUrl).toBe('http://localhost:3000/host/billing');
  });

  it('is forbidden to Recruiters through the route', async () => {
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    vi.mocked(requireHost).mockResolvedValue(recruiter.ctx);
    const { POST } = await import('@/app/api/v1/host/billing/portal/route');
    const res = await POST(
      new Request('http://localhost:3000/api/v1/host/billing/portal', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; details: { reason: string } } };
    expect(body.error).toMatchObject({ code: 'forbidden', details: { reason: 'role_not_allowed' } });
    expect(gw.callsTo('createPortalSession')).toHaveLength(0);
  });
});
