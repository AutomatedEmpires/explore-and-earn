// Webhooks, sync and subscription state (Task 14, with the FD-7 founding discount), with the
// fake gateway and the W0 fakes for entitlements and orgs (the orgs founding cohort is real).
// Trust, notifications, audit, settings and jobs are real.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { POST as stripeWebhookRoute } from '@/app/api/webhooks/stripe/route';
import { reserveFoundingNumber } from '@/modules/orgs';
import { decide } from '@/modules/trust';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedMember, type SeededOrg } from '../../../tests/helpers/sp2';
import { finishCheckout } from './complete';
import { getFoundingSummary } from './founding';
import type { SubSnapshot } from './gateway';
import { makeFakeBillingGateway, type FakeBillingGateway } from './gateway-fake';
import { startOfNextMonthUtc } from './internal';
import { getBillingOverview, getPublicPrices, resetPublicPricesCache } from './overview';
import { getSubscriberBadges, getSubscriptionState } from './state';
import { syncSubscription } from './sync';
import { handleStripeWebhook } from './webhook';
import { jobHandlers } from './index';

const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
// The job handler and the routes use billingGateway(); point it at each test's fake.
const gwHolder = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('./gateway', async (orig) => ({
  ...(await orig<typeof import('./gateway')>()),
  billingGateway: () => gwHolder.current,
}));
vi.mock('@/lib/db', async (orig) => ({
  ...(await orig<typeof import('@/lib/db')>()),
  getDb: () => {
    if (!dbHolder.current) throw new Error('test db not ready');
    return dbHolder.current;
  },
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
let operatorOwnerId: string;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
  operatorOwnerId = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${operatorOwnerId}, ${`user_${operatorOwnerId}`}, 'owner@ops.test', 'Ops', 'operator')
  `);
  await t.db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (${operatorOwnerId}, 'owner', '{}'::text[], 'on_shift')
  `);
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  entitlementsFake.reset();
  gw = makeFakeBillingGateway();
  gwHolder.current = gw;
  org = await seedHostOrg(t.db);
});

let subN = 0;

/** A subscription in the fake, for `org` unless told otherwise. */
function stripeSub(o: Partial<SubSnapshot> & { orgId?: string } = {}): SubSnapshot {
  const now = new Date();
  const s: SubSnapshot = {
    id: `sub_test_${newId().slice(-8)}_${++subN}`,
    customerId: `cus_test_${newId().slice(-8)}`,
    status: 'active',
    items: [{ lookupKey: 'professional_month', quantity: 1 }],
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
    trialEnd: null,
    cancelAtPeriodEnd: false,
    endedAt: null,
    startDate: new Date('2026-11-01T12:00:00Z'),
    activatedAt: new Date('2026-11-01T12:00:00Z'),
    couponId: null,
    initialCouponId: o.couponId ?? null,
    metadata: { orgId: o.orgId ?? org.orgId },
    created: new Date('2026-11-01T12:00:00Z'),
    ...o,
  };
  gw.setSubscription(s);
  return s;
}

function update(s: SubSnapshot, patch: Partial<SubSnapshot>): SubSnapshot {
  const next = { ...s, ...patch };
  gw.setSubscription(next);
  return next;
}

const items = (plan: string, extra = 0) => [
  { lookupKey: `${plan}_month`, quantity: 1 },
  ...(extra > 0 ? [{ lookupKey: `slot_${plan}_month`, quantity: extra }] : []),
];

function event(type: string, object: Record<string, unknown>, id = `evt_${newId()}`) {
  const body = JSON.stringify({ id, type, data: { object } });
  return { id, body, signature: gw.signEvent(body) };
}

const planGrantKeys = () =>
  entitlementsFake.calls
    .filter((c) => c.name === 'grant')
    .map((c) => (c.args[0] as { idempotencyKey: string }).idempotencyKey)
    .filter((k) => k.startsWith('plan:'));

async function outboxRows(topic: string, orgId?: string) {
  return queryRows<{ dedupe_key: string; payload: string }>(
    t.db,
    sql`select dedupe_key, payload::text as payload from app.outbox where topic = ${topic}
        ${orgId ? sql`and payload::text like ${`%${orgId}%`}` : sql``}`,
  );
}

async function notificationsFor(userId: string, type: string) {
  return queryRows<{ data: string }>(
    t.db,
    sql`select data::text from app.notifications where user_id = ${userId}::uuid and type = ${type}`,
  );
}

type DiscountRow = {
  shape: string;
  coupon_id: string;
  stripe_subscription_id: string;
  started_at: string;
  ends_at: string;
  ended_reason: string | null;
};

async function discountOf(orgId: string): Promise<DiscountRow | undefined> {
  const [row] = await queryRows<DiscountRow>(
    t.db,
    sql`select shape, coupon_id, stripe_subscription_id, started_at::text, ends_at::text,
          ended_reason
        from app.founding_discounts where org_id = ${orgId}::uuid`,
  );
  return row;
}

async function billingItems(orgId: string) {
  return queryRows<{ reason: string }>(
    t.db,
    sql`select reason from app.review_items where subject_type = 'billing_account'
        and subject_id = ${orgId}`,
  );
}

/** The `mismatch` of each founding alert raised for `subscriptionId`. */
async function foundingAlerts(subscriptionId: string): Promise<string[]> {
  const rows = await queryRows<{ data: string }>(
    t.db,
    sql`select data::text from app.audit_events where action = 'trust.alert'`,
  );
  return rows
    .map((r) => JSON.parse(r.data) as { kind: string; data: { subscriptionId?: string; mismatch?: string } })
    .filter((d) => d.kind === 'billing.founding_mismatch' && d.data.subscriptionId === subscriptionId)
    .map((d) => d.data.mismatch ?? '');
}

const yearItems = (plan: string) => [{ lookupKey: `${plan}_year`, quantity: 1 }];
const START = new Date('2026-11-01T12:00:00Z');

describe('handleStripeWebhook', () => {
  it('applies an event once and enqueues one sync keyed by the event', async () => {
    const s = stripeSub();
    const e = event('customer.subscription.updated', { id: s.id, object: 'subscription' });
    expect(await handleStripeWebhook(t.db, e.body, e.signature, gw)).toBe('applied');
    expect(await handleStripeWebhook(t.db, e.body, e.signature, gw)).toBe('duplicate');
    const rows = await queryRows<{ dedupe_key: string; payload: string }>(
      t.db,
      sql`select dedupe_key, payload::text as payload from app.outbox
          where dedupe_key = ${`stripe:${e.id}`}`,
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.payload ?? '{}')).toEqual({ subscriptionId: s.id });
  });

  it('rejects a bad signature', async () => {
    const e = event('customer.subscription.updated', { id: 'sub_x' });
    await expect(handleStripeWebhook(t.db, e.body, 'v1=bad', gw)).rejects.toMatchObject({
      code: 'bad_request',
    });
  });

  it('syncs the subscription a completed Checkout or a paid invoice names', async () => {
    const s = stripeSub();
    const checkout = event('checkout.session.completed', {
      id: 'cs_1',
      mode: 'subscription',
      subscription: s.id,
    });
    const invoice = event('invoice.paid', {
      id: 'in_1',
      parent: { subscription_details: { subscription: s.id } },
    });
    const failed = event('invoice.payment_failed', { id: 'in_2', subscription: s.id });
    const ending = event('customer.subscription.trial_will_end', { id: s.id });
    for (const e of [checkout, invoice, failed, ending]) {
      await handleStripeWebhook(t.db, e.body, e.signature, gw);
    }
    const payload = async (id: string) => {
      const [row] = await queryRows<{ payload: string }>(
        t.db,
        sql`select payload::text from app.outbox where dedupe_key = ${`stripe:${id}`}`,
      );
      return JSON.parse(row?.payload ?? 'null') as unknown;
    };
    expect(await payload(checkout.id)).toEqual({ subscriptionId: s.id });
    expect(await payload(invoice.id)).toEqual({ subscriptionId: s.id });
    expect(await payload(failed.id)).toEqual({ subscriptionId: s.id, notify: 'payment_failed' });
    expect(await payload(ending.id)).toEqual({ subscriptionId: s.id, notify: 'trial_ending' });
  });

  it('only records other events', async () => {
    const e = event('charge.refunded', { id: 'ch_1' });
    expect(await handleStripeWebhook(t.db, e.body, e.signature, gw)).toBe('applied');
    expect(await outboxRows('billing.sync_subscription', 'ch_1')).toHaveLength(0);
    const [row] = await queryRows<{ event_type: string; source: string }>(
      t.db,
      sql`select event_type, source from app.webhook_events where id = ${e.id}`,
    );
    expect(row).toEqual({ event_type: 'charge.refunded', source: 'stripe' });
  });
});

describe('POST /api/webhooks/stripe', () => {
  it('answers 400 for a bad signature and 200 { received: true } for a good one', async () => {
    const body = JSON.stringify({ id: `evt_${newId()}`, type: 'charge.refunded', data: { object: {} } });
    const send = (signature: string) =>
      stripeWebhookRoute(
        new Request('http://localhost:3000/api/webhooks/stripe', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'stripe-signature': signature },
          body,
        }),
      );
    const bad = await send('t=1,v1=nope');
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('bad_request');
    const good = await send(gw.signEvent(body));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ received: true });
  });
});

describe('syncSubscription', () => {
  it('ends at Stripe state whatever order the events arrive in', async () => {
    const s = stripeSub();
    const updated = event('customer.subscription.updated', { id: s.id });
    const created = event('customer.subscription.created', { id: s.id });
    await handleStripeWebhook(t.db, updated.body, updated.signature, gw);
    await handleStripeWebhook(t.db, created.body, created.signature, gw);
    for (const p of [{ subscriptionId: s.id }, { subscriptionId: s.id }]) {
      await jobHandlers['billing.sync_subscription']?.(p, { db: t.db, now: new Date() });
    }
    const rows = await queryRows<{ status: string; plan: string; interval: string }>(
      t.db,
      sql`select status, plan, interval from app.subscriptions where org_id = ${org.orgId}::uuid`,
    );
    expect(rows).toEqual([{ status: 'active', plan: 'professional', interval: 'month' }]);
  });

  it('never resurrects a canceled subscription from an older event', async () => {
    const s = stripeSub({ status: 'canceled', endedAt: new Date() });
    const stale = event('customer.subscription.updated', { id: s.id, status: 'active' });
    await handleStripeWebhook(t.db, stale.body, stale.signature, gw);
    await syncSubscription(t.db, s.id, gw);
    expect((await getSubscriptionState(t.db, org.orgId)).status).toBe('canceled');
    expect(planGrantKeys()).toEqual([]);
  });

  it('grants plan slots and seats, plus the month of credits, and writes nothing on a replay', async () => {
    const s = stripeSub({ items: items('professional', 2) });
    await syncSubscription(t.db, s.id, gw);
    expect(planGrantKeys()).toEqual([
      `plan:${s.id}:listing_slot:12:1`,
      `plan:${s.id}:seat:5:1`,
    ]);
    const credits = entitlementsFake.grants.find((g) => g.kind === 'invite_credit');
    expect(credits?.quantity).toBe(50);
    expect(credits?.validUntil).toEqual(startOfNextMonthUtc(new Date()));

    const before = entitlementsFake.grants.length;
    await syncSubscription(t.db, s.id, gw);
    expect(entitlementsFake.grants.length).toBe(before);

    update(s, { items: items('starter') });
    await syncSubscription(t.db, s.id, gw);
    expect(planGrantKeys().slice(2)).toEqual([
      `plan:${s.id}:listing_slot:2:2`,
      `plan:${s.id}:seat:1:2`,
    ]);
    expect(await entitlementsFake.getCapacity(t.db, org.orgId, 'listing_slot')).toMatchObject({
      limit: 2,
    });
    expect(await entitlementsFake.getCapacity(t.db, org.orgId, 'seat')).toMatchObject({ limit: 1 });
  });

  it('issues fresh grants when a subscription goes back to an earlier quantity', async () => {
    let s = stripeSub({ items: items('professional', 2) });
    await syncSubscription(t.db, s.id, gw);
    s = update(s, { items: items('starter') });
    await syncSubscription(t.db, s.id, gw);
    s = update(s, { items: items('professional', 2) });
    await syncSubscription(t.db, s.id, gw);
    expect(planGrantKeys().slice(-2)).toEqual([
      `plan:${s.id}:listing_slot:12:3`,
      `plan:${s.id}:seat:5:3`,
    ]);
    expect(await entitlementsFake.getCapacity(t.db, org.orgId, 'listing_slot')).toMatchObject({
      limit: 12,
    });
    expect(await entitlementsFake.getCapacity(t.db, org.orgId, 'seat')).toMatchObject({ limit: 5 });

    for (const extra of [3, 2]) {
      s = update(s, { items: items('professional', extra) });
      await syncSubscription(t.db, s.id, gw);
    }
    expect(await entitlementsFake.getCapacity(t.db, org.orgId, 'listing_slot')).toMatchObject({
      limit: 12,
    });
  });

  it('sets host_since once, and a lapse clears it and the badge', async () => {
    const s = stripeSub();
    await syncSubscription(t.db, s.id, gw);
    const state = await getSubscriptionState(t.db, org.orgId);
    expect(state.hostSince).toEqual(s.startDate);
    expect((await getSubscriberBadges(t.db, [org.orgId])).get(org.orgId)).toEqual({
      hostSince: s.startDate,
    });

    update(s, { startDate: new Date('2026-11-02T00:00:00Z') });
    await syncSubscription(t.db, s.id, gw);
    expect((await getSubscriptionState(t.db, org.orgId)).hostSince).toEqual(s.startDate);

    entitlementsFake.setUsed(org.orgId, 'listing_slot', 3);
    update(s, { status: 'canceled', endedAt: new Date() });
    await syncSubscription(t.db, s.id, gw);
    expect(await getSubscriptionState(t.db, org.orgId)).toMatchObject({
      status: 'canceled',
      entitled: false,
      hostSince: null,
      founding: 'none',
    });
    expect((await getSubscriberBadges(t.db, [org.orgId])).has(org.orgId)).toBe(false);
    const ended = await notificationsFor(org.owner.userId, 'billing.subscription_ended');
    expect(ended).toHaveLength(1);
    expect(JSON.parse(ended[0]?.data ?? '{}')).toMatchObject({ closingListings: 3 });
    expect(await entitlementsFake.listOpenGrants(t.db, org.orgId, { kind: 'listing_slot' })).toEqual(
      [],
    );

    // A replay of the cancellation changes nothing more.
    await syncSubscription(t.db, s.id, gw);
    expect(await notificationsFor(org.owner.userId, 'billing.subscription_ended')).toHaveLength(1);
  });

  it('keeps past_due entitled but unable to publish, and reports none without a row', async () => {
    expect(await getSubscriptionState(t.db, org.orgId)).toMatchObject({
      status: 'none',
      entitled: false,
      canPublish: false,
      plan: null,
      founding: 'none',
    });
    const s = stripeSub({ status: 'past_due' });
    await syncSubscription(t.db, s.id, gw);
    expect(await getSubscriptionState(t.db, org.orgId)).toMatchObject({
      status: 'past_due',
      entitled: true,
      canPublish: false,
      plan: 'professional',
      interval: 'month',
    });
  });

  it('emits subscription.changed only when something changed', async () => {
    const s = stripeSub();
    await syncSubscription(t.db, s.id, gw);
    await syncSubscription(t.db, s.id, gw);
    expect(await outboxRows('listings.enforce_slot_limit', org.orgId)).toHaveLength(1);
    update(s, { items: items('starter') });
    await syncSubscription(t.db, s.id, gw);
    const rows = await outboxRows('listings.enforce_slot_limit', org.orgId);
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[1]?.payload ?? '{}')).toMatchObject({
      event: 'subscription.changed',
      data: { orgId: org.orgId, status: 'active', plan: 'starter' },
    });
  });

  it('notifies billing contacts when the subscription starts and when the plan changes', async () => {
    const s = stripeSub();
    await syncSubscription(t.db, s.id, gw);
    expect(await notificationsFor(org.owner.userId, 'billing.subscription_started')).toHaveLength(1);
    update(s, { items: items('enterprise') });
    await syncSubscription(t.db, s.id, gw);
    expect(await notificationsFor(org.owner.userId, 'billing.plan_changed')).toHaveLength(1);
    // A downgrade that leaves more listings than slots: listings closes them and says so.
    entitlementsFake.setUsed(org.orgId, 'listing_slot', 5);
    update(s, { items: items('starter') });
    await syncSubscription(t.db, s.id, gw);
    expect(await notificationsFor(org.owner.userId, 'billing.plan_changed')).toHaveLength(1);
  });

  it('grants nothing for an unknown price, and opens a billing item that decides nothing else', async () => {
    const s = stripeSub({ items: [{ lookupKey: 'gold_month', quantity: 1 }] });
    await syncSubscription(t.db, s.id, gw);
    expect(planGrantKeys()).toEqual([]);
    expect((await getSubscriptionState(t.db, org.orgId)).status).toBe('none');

    const [item] = await queryRows<{ id: string; queue: string; reason: string }>(
      t.db,
      sql`select id, queue, reason from app.review_items
          where subject_type = 'billing_account' and subject_id = ${org.orgId}`,
    );
    expect(item).toMatchObject({ queue: 'billing', reason: 'unknown_price' });
    const alerts = await notificationsFor(operatorOwnerId, 'operator.alert');
    expect(alerts.map((a) => JSON.parse(a.data) as { severity: string; kind: string })).toContainEqual(
      expect.objectContaining({ severity: 'critical', kind: 'billing.unknown_price' }),
    );

    // A replay opens no second item.
    await syncSubscription(t.db, s.id, gw);
    const items2 = await queryRows(
      t.db,
      sql`select 1 from app.review_items where subject_type = 'billing_account'
          and subject_id = ${org.orgId}`,
    );
    expect(items2).toHaveLength(1);

    await decide(t.db, item?.id ?? '', operatorOwnerId, 'approve');
    const [o] = await queryRows<{ verification_status: string }>(
      t.db,
      sql`select verification_status from app.organizations where id = ${org.orgId}::uuid`,
    );
    expect(o?.verification_status).toBe('unverified');
    expect(await outboxRows('listings.resume_screening', org.orgId)).toHaveLength(0);
  });

  it('grants nothing for a second current subscription', async () => {
    const first = stripeSub();
    await syncSubscription(t.db, first.id, gw);
    const keys = planGrantKeys().length;
    const second = stripeSub({ items: items('enterprise') });
    await syncSubscription(t.db, second.id, gw);
    expect(planGrantKeys().length).toBe(keys);
    const [item] = await queryRows<{ reason: string }>(
      t.db,
      sql`select reason from app.review_items where subject_type = 'billing_account'
          and subject_id = ${org.orgId}`,
    );
    expect(item?.reason).toBe('duplicate_subscription');
  });

  it('raises a warning and returns for a subscription no org owns', async () => {
    const s = stripeSub({ metadata: {} });
    await expect(
      jobHandlers['billing.sync_subscription']?.({ subscriptionId: s.id }, { db: t.db, now: new Date() }),
    ).resolves.toBeUndefined();
    const alerts = await notificationsFor(operatorOwnerId, 'operator.alert');
    expect(alerts.map((a) => JSON.parse(a.data) as { severity: string; kind: string })).toContainEqual(
      expect.objectContaining({ severity: 'warning', kind: 'billing.unknown_customer' }),
    );
  });

  it('tells billing contacts, not recruiters, about a failed payment', async () => {
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const billing = await seedMember(t.db, org.orgId, 'billing');
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    const s = stripeSub();
    const e = event('invoice.payment_failed', { id: 'in_x', subscription: s.id });
    await handleStripeWebhook(t.db, e.body, e.signature, gw);
    // Run the job the webhook enqueued, as the worker would.
    const [job] = await queryRows<{ payload: string }>(
      t.db,
      sql`select payload::text from app.outbox where dedupe_key = ${`stripe:${e.id}`}`,
    );
    await jobHandlers['billing.sync_subscription']?.(JSON.parse(job?.payload ?? '{}'), {
      db: t.db,
      now: new Date(),
    });
    for (const m of [org.owner, admin, billing]) {
      expect(await notificationsFor(m.userId, 'billing.payment_failed'), m.email).toHaveLength(1);
    }
    expect(await notificationsFor(recruiter.userId, 'billing.payment_failed')).toHaveLength(0);
  });
});

describe('founding discount (FD-7)', () => {
  beforeEach(async () => {
    await reserveFoundingNumber(t.db, org.orgId);
  });

  it('is eligible before the first subscription, whatever the signup date', async () => {
    expect((await getSubscriptionState(t.db, org.orgId)).founding).toBe('eligible');
  });

  it('locks the monthly shape at the first paid activation, and starts the six months there', async () => {
    const s = stripeSub({ couponId: 'founding_50_six_months', startDate: START, activatedAt: START });
    await syncSubscription(t.db, s.id, gw);
    expect(await discountOf(org.orgId)).toEqual({
      shape: 'monthly',
      coupon_id: 'founding_50_six_months',
      stripe_subscription_id: s.id,
      started_at: '2026-11-01 12:00:00+00',
      ends_at: '2027-05-01 12:00:00+00',
      ended_reason: null,
    });
    expect((await getSubscriptionState(t.db, org.orgId)).founding).toBe('active');
    expect(await billingItems(org.orgId)).toEqual([]);

    await syncSubscription(t.db, s.id, gw);
    const audits = await queryRows(
      t.db,
      sql`select 1 from app.audit_events
          where action = 'billing.founding_started' and org_id = ${org.orgId}::uuid`,
    );
    expect(audits).toHaveLength(1);
  });

  it('locks the annual shape for the first annual term', async () => {
    const s = stripeSub({
      couponId: 'founding_50_first_year',
      items: yearItems('starter'),
      startDate: START,
    });
    await syncSubscription(t.db, s.id, gw);
    expect(await discountOf(org.orgId)).toMatchObject({
      shape: 'annual',
      coupon_id: 'founding_50_first_year',
      started_at: '2026-11-01 12:00:00+00',
      ends_at: '2027-11-01 12:00:00+00',
      ended_reason: null,
    });
  });

  it('locks the annual shape from the first invoice once Stripe drops the once coupon', async () => {
    // As Stripe returns a paid annual founding subscription: the `once` coupon is gone from the
    // subscription, and only the invoice that created it still has it.
    const s = stripeSub({
      couponId: null,
      initialCouponId: 'founding_50_first_year',
      items: yearItems('professional'),
      startDate: START,
    });
    await syncSubscription(t.db, s.id, gw);
    expect(await discountOf(org.orgId)).toMatchObject({
      shape: 'annual',
      coupon_id: 'founding_50_first_year',
      ends_at: '2027-11-01 12:00:00+00',
      ended_reason: null,
    });
    expect((await getSubscriptionState(t.db, org.orgId)).founding).toBe('active');
    expect(await billingItems(org.orgId)).toEqual([]);

    // A switch to monthly (no new invoice yet) ends it, with no false wrong-interval report.
    update(s, { items: items('professional') });
    await syncSubscription(t.db, s.id, gw);
    expect((await discountOf(org.orgId))?.ended_reason).toBe('interval_change');
    expect(await billingItems(org.orgId)).toEqual([]);
  });

  it('waits for the first paid activation, and starts the clock there, not at creation', async () => {
    // Created on 1 November, but its first payment failed.
    const s = stripeSub({
      status: 'incomplete',
      couponId: 'founding_50_six_months',
      startDate: START,
      activatedAt: null,
    });
    await syncSubscription(t.db, s.id, gw);
    expect(await discountOf(org.orgId)).toBeUndefined();
    expect((await getSubscriptionState(t.db, org.orgId)).founding).toBe('eligible');

    // Paid on 15 December. Stripe's start_date stays at creation.
    update(s, { status: 'active', activatedAt: new Date('2026-12-15T00:00:00Z') });
    await syncSubscription(t.db, s.id, gw);
    expect(await discountOf(org.orgId)).toMatchObject({
      started_at: '2026-12-15 00:00:00+00',
      ends_at: '2027-06-15 00:00:00+00',
    });
  });

  it('keeps the discount, and its end date, through monthly tier changes', async () => {
    let s = stripeSub({ couponId: 'founding_50_six_months', startDate: START });
    await syncSubscription(t.db, s.id, gw);
    for (const plan of ['enterprise', 'starter']) {
      s = update(s, { items: items(plan) });
      await syncSubscription(t.db, s.id, gw);
    }
    expect(await discountOf(org.orgId)).toMatchObject({
      shape: 'monthly',
      ends_at: '2027-05-01 12:00:00+00',
      ended_reason: null,
    });
    expect((await getSubscriptionState(t.db, org.orgId)).founding).toBe('active');
    expect(await billingItems(org.orgId)).toEqual([]);
  });

  it('ends on a switch to annual, and never grants a second introductory period', async () => {
    let s = stripeSub({ couponId: 'founding_50_six_months', startDate: START });
    await syncSubscription(t.db, s.id, gw);
    // The plan change removes the coupon with the interval change (change.ts).
    s = update(s, { items: yearItems('professional'), couponId: null });
    await syncSubscription(t.db, s.id, gw);
    expect((await discountOf(org.orgId))?.ended_reason).toBe('interval_change');
    expect((await getSubscriptionState(t.db, org.orgId)).founding).toBe('ended');
    expect(await billingItems(org.orgId)).toEqual([]);

    // A later subscription that somehow carries a founding coupon is reported, not honoured.
    update(s, { status: 'canceled', endedAt: new Date() });
    await syncSubscription(t.db, s.id, gw);
    const again = stripeSub({ couponId: 'founding_50_first_year', items: yearItems('starter') });
    await syncSubscription(t.db, again.id, gw);
    expect((await discountOf(org.orgId))?.stripe_subscription_id).toBe(s.id);
    expect(await foundingAlerts(again.id)).toEqual(['second_intro']);
    expect(await billingItems(org.orgId)).toEqual([{ reason: 'founding_mismatch' }]);
  });

  it('reports a coupon left on after a switch to the other interval', async () => {
    let s = stripeSub({ couponId: 'founding_50_six_months', startDate: START });
    await syncSubscription(t.db, s.id, gw);
    s = update(s, { items: yearItems('professional') });
    await syncSubscription(t.db, s.id, gw);
    expect((await discountOf(org.orgId))?.ended_reason).toBe('interval_change');
    expect(await foundingAlerts(s.id)).toEqual(['wrong_interval']);
  });

  it('ends the introductory period when its subscription ends', async () => {
    const s = stripeSub({ couponId: 'founding_50_six_months', startDate: START });
    await syncSubscription(t.db, s.id, gw);
    update(s, { status: 'canceled', endedAt: new Date() });
    await syncSubscription(t.db, s.id, gw);
    expect((await discountOf(org.orgId))?.ended_reason).toBe('subscription_ended');
    expect((await getFoundingSummary(t.db, org.orgId)).status).toBe('ended');
  });

  it('reports a founding host whose first activated subscription had no discount', async () => {
    const first = stripeSub();
    await syncSubscription(t.db, first.id, gw);
    update(first, { status: 'canceled', endedAt: new Date() });
    await syncSubscription(t.db, first.id, gw);
    expect((await getSubscriptionState(t.db, org.orgId)).founding).toBe('none');

    const later = stripeSub({ couponId: 'founding_50_six_months' });
    await syncSubscription(t.db, later.id, gw);
    expect(await discountOf(org.orgId)).toBeUndefined();
    expect(await foundingAlerts(later.id)).toEqual(['second_intro']);
  });
});

describe('founding mismatches (FD-7)', () => {
  it('reports organization 101 (not in the cohort), and still grants the plan it pays for', async () => {
    const s = stripeSub({ couponId: 'founding_50_six_months' });
    await syncSubscription(t.db, s.id, gw);
    expect(await discountOf(org.orgId)).toBeUndefined();
    expect(planGrantKeys()).toEqual([`plan:${s.id}:listing_slot:10:1`, `plan:${s.id}:seat:5:1`]);
    expect(await billingItems(org.orgId)).toEqual([{ reason: 'founding_mismatch' }]);
    expect(await foundingAlerts(s.id)).toEqual(['not_in_cohort']);
    const alerts = await notificationsFor(operatorOwnerId, 'operator.alert');
    expect(alerts.map((a) => JSON.parse(a.data) as { severity: string; kind: string })).toContainEqual(
      expect.objectContaining({ severity: 'critical', kind: 'billing.founding_mismatch' }),
    );

    // A replay opens no second item.
    await syncSubscription(t.db, s.id, gw);
    expect(await billingItems(org.orgId)).toHaveLength(1);
  });

  it('reports a founding coupon on the other interval', async () => {
    await reserveFoundingNumber(t.db, org.orgId);
    const s = stripeSub({ couponId: 'founding_50_six_months', items: yearItems('enterprise') });
    await syncSubscription(t.db, s.id, gw);
    expect(await discountOf(org.orgId)).toBeUndefined();
    expect(await foundingAlerts(s.id)).toEqual(['wrong_interval']);
  });

  it('reports the retired founding_30_forever coupon, even for a founding host', async () => {
    await reserveFoundingNumber(t.db, org.orgId);
    const s = stripeSub({ couponId: 'founding_30_forever' });
    await syncSubscription(t.db, s.id, gw);
    expect(await discountOf(org.orgId)).toBeUndefined();
    expect(await foundingAlerts(s.id)).toEqual(['retired_coupon']);
  });
});

describe('finishCheckout (GET /host/billing/complete)', () => {
  it('entitles the org from Stripe data alone, with no webhook', async () => {
    const { id: customerId } = await gw.createCustomer(
      { orgId: org.orgId, name: 'Kettle', email: null },
      `customer:${org.orgId}`,
    );
    const session = await gw.createCheckoutSession(
      {
        customerId,
        items: items('professional'),
        trialEnd: null,
        couponId: null,
        allowPromotionCodes: true,
        metadata: { orgId: org.orgId },
        clientReferenceId: org.orgId,
        successUrl: 'http://localhost:3000/host/billing/complete?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'http://localhost:3000/host/billing/plans',
        expiresAt: new Date(Date.now() + 31 * 60_000),
      },
      'checkout:x',
    );
    expect(await finishCheckout(t.db, org.owner.ctx, session.id, gw)).toEqual({ status: 'none' });
    gw.completeCheckout(session.id);
    expect(await finishCheckout(t.db, org.owner.ctx, session.id, gw)).toEqual({ status: 'active' });
    expect((await getSubscriptionState(t.db, org.orgId)).entitled).toBe(true);
  });

  it("refuses another org's session", async () => {
    const other = await seedHostOrg(t.db);
    const session = await gw.createCheckoutSession(
      {
        customerId: 'cus_1',
        items: items('starter'),
        trialEnd: null,
        couponId: null,
        allowPromotionCodes: true,
        metadata: { orgId: other.orgId },
        clientReferenceId: other.orgId,
        successUrl: 'http://localhost:3000/x',
        cancelUrl: 'http://localhost:3000/y',
        expiresAt: new Date(Date.now() + 31 * 60_000),
      },
      'checkout:y',
    );
    await expect(finishCheckout(t.db, org.owner.ctx, session.id, gw)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('getBillingOverview', () => {
  it('reports the plan, usage, prices and founding', async () => {
    resetPublicPricesCache();
    const s = stripeSub();
    await syncSubscription(t.db, s.id, gw);
    entitlementsFake.setUsed(org.orgId, 'listing_slot', 4);
    entitlementsFake.setUsed(org.orgId, 'seat', 2);
    const overview = await getBillingOverview(t.db, org.owner.ctx, gw);
    expect(overview.subscription).toMatchObject({ status: 'active', plan: 'professional' });
    expect(overview.usage).toMatchObject({
      listingSlots: { used: 4, limit: 10 },
      seats: { used: 2, limit: 5 },
      inviteCredits: { balance: 50 },
    });
    expect(overview.prices.plans.professional).toEqual({
      month: 29900,
      year: 299000,
      slotMonth: 2900,
      slotYear: 29000,
    });
    expect(overview.founding).toMatchObject({
      status: 'none',
      number: null,
      shape: null,
      percentOff: 50,
      endsAt: null,
    });
    expect(overview.founding.spotsLeft).toBeGreaterThanOrEqual(0);
    expect(overview.founding.spotsLeft).toBeLessThanOrEqual(100);
  });

  it("reports a founding host's discount and the spots left", async () => {
    resetPublicPricesCache();
    const number = await reserveFoundingNumber(t.db, org.orgId);
    const before = await getBillingOverview(t.db, org.owner.ctx, gw);
    expect(before.founding).toMatchObject({ status: 'eligible', number, shape: null });
    const s = stripeSub({ couponId: 'founding_50_six_months', startDate: START });
    await syncSubscription(t.db, s.id, gw);
    const after = await getBillingOverview(t.db, org.owner.ctx, gw);
    expect(after.founding).toMatchObject({
      status: 'active',
      number,
      shape: 'monthly',
      percentOff: 50,
      startedAt: START,
      endsAt: new Date('2027-05-01T12:00:00Z'),
    });
    expect(after.founding.spotsLeft).toBe(before.founding.spotsLeft);
  });

  it('falls back to PLANS when Stripe prices fail, and caches Stripe prices for an hour', async () => {
    resetPublicPricesCache();
    gw.failNext('listPrices');
    const fallback = await getPublicPrices(gw);
    expect(fallback.source).toBe('fallback');
    expect(fallback.plans.starter.month).toBe(9900);
    const live = await getPublicPrices(gw);
    expect(live.source).toBe('stripe');
    await getPublicPrices(gw);
    expect(gw.callsTo('listPrices')).toHaveLength(2);
  });
});
