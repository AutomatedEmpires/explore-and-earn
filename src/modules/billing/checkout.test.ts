// Hosted Checkout (Task 13, with FD-7 pricing): the founding coupon for a founding host's first
// subscription, regular prices for everyone else, session reuse and Stripe customers.
// Entitlements and orgs are the W0 fakes (the orgs founding cohort is real); everything else is
// real.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { reserveFoundingNumber } from '@/modules/orgs';
import { setSetting } from '@/modules/settings';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { FIXED_NOW, seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import { createCheckout } from './checkout';
import { ensureStripeCustomer } from './customers';
import { makeFakeBillingGateway, type FakeBillingGateway } from './gateway-fake';
import type { CheckoutParams } from './gateway';

vi.mock('@/modules/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/modules/entitlements')>()),
  ...(await import('../../../tests/fakes/sp2/entitlements')).entitlementsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));

const operatorId = newId();
let t: TestDb;
let gw: FakeBillingGateway;
let org: SeededOrg;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
  await t.db.execute(sql`delete from app.settings`);
  await t.db.execute(sql`delete from app.founding_discounts`);
  await t.db.execute(sql`delete from app.founding_cohort`);
  gw = makeFakeBillingGateway();
  org = await seedHostOrg(t.db);
});

afterEach(() => {
  vi.useRealTimers();
});

const professional = { plan: 'professional' as const, interval: 'month' as const, extraSlots: 0 };

const sessionParams = (n = -1) => {
  const calls = gw.callsTo('createCheckoutSession');
  return calls.at(n)?.[0] as CheckoutParams;
};

/** Gives `orgId` the next founding number, as signing up through the app would. */
const joinCohort = (orgId: string) => reserveFoundingNumber(t.db, orgId);

/** Takes every founding number still free, with organizations that signed up earlier. */
async function fillCohort() {
  for (;;) {
    const filler = await seedHostOrg(t.db);
    if ((await joinCohort(filler.orgId)) === null) return;
  }
}

/** A subscription row as sync leaves it; `paid` sets activated_at (its first payment). */
async function subscriptionRow(status: string, orgId = org.orgId, o: { paid?: boolean } = {}) {
  await t.db.execute(sql`
    insert into app.subscriptions (id, org_id, stripe_subscription_id, status, plan, interval,
      activated_at)
    values (${newId()}, ${orgId}, ${`sub_${newId()}`}, ${status}, 'starter', 'month',
      ${o.paid ? FIXED_NOW : null})
  `);
}

describe('founding hosts (FD-7)', () => {
  it('gives a monthly first subscription the six-month coupon, with no free period', async () => {
    expect(await joinCohort(org.orgId)).toBe(1);
    const { url } = await createCheckout(t.db, org.owner.ctx, professional, gw);
    expect(url).toContain('checkout.stripe.test');

    const p = sessionParams();
    expect(p.couponId).toBe('founding_50_six_months');
    expect(p.allowPromotionCodes).toBe(false);
    expect(p.trialEnd).toBeNull();
    expect(p.metadata).toEqual({ orgId: org.orgId, foundingNumber: '1', foundingShape: 'monthly' });
    expect(p.clientReferenceId).toBe(org.orgId);
    expect(p.expiresAt).toEqual(new Date(FIXED_NOW.getTime() + 31 * 60_000));
    expect(p.successUrl).toBe(
      'http://localhost:3000/host/billing/complete?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(p.cancelUrl).toBe('http://localhost:3000/host/billing/plans');

    const [audit] = await queryRows<{ data: string }>(
      t.db,
      sql`select data::text from app.audit_events
          where action = 'billing.checkout_started' and org_id = ${org.orgId}::uuid`,
    );
    expect(JSON.parse(audit?.data ?? '{}')).toMatchObject({
      plan: 'professional',
      interval: 'month',
      extraSlots: 0,
      founding: true,
      foundingShape: 'monthly',
    });
  });

  it('gives an annual first subscription the first-annual-term coupon, on every tier', async () => {
    await joinCohort(org.orgId);
    for (const plan of ['starter', 'professional', 'enterprise'] as const) {
      await createCheckout(t.db, org.owner.ctx, { plan, interval: 'year', extraSlots: 0 }, gw);
      expect(sessionParams()).toMatchObject({
        couponId: 'founding_50_first_year',
        allowPromotionCodes: false,
        trialEnd: null,
        items: [{ lookupKey: `${plan}_year`, quantity: 1 }],
      });
      expect(sessionParams().metadata.foundingShape).toBe('annual');
    }
  });

  it('refuses the discount to organization 101, even when earlier ones never subscribed', async () => {
    await fillCohort();
    const late = await seedHostOrg(t.db);
    expect(await joinCohort(late.orgId)).toBeNull();
    await createCheckout(t.db, late.owner.ctx, professional, gw);
    expect(sessionParams()).toMatchObject({ couponId: null, allowPromotionCodes: true });
    expect(sessionParams().metadata).toEqual({ orgId: late.orgId });
  });

  it('refuses a second introductory period', async () => {
    await joinCohort(org.orgId);
    // The org's discount was already used.
    await t.db.execute(sql`
      insert into app.founding_discounts (org_id, shape, coupon_id, stripe_subscription_id,
        started_at, ends_at)
      values (${org.orgId}, 'monthly', 'founding_50_six_months', ${`sub_${newId()}`},
        ${FIXED_NOW}, ${new Date(FIXED_NOW.getTime() + 180 * 86_400_000)})
    `);
    for (const interval of ['month', 'year'] as const) {
      await createCheckout(t.db, org.owner.ctx, { ...professional, interval }, gw);
      expect(sessionParams()).toMatchObject({ couponId: null, allowPromotionCodes: true });
    }

    // A founding host whose first subscription was paid (and ended) without it.
    const other = await seedHostOrg(t.db);
    await joinCohort(other.orgId);
    await subscriptionRow('canceled', other.orgId, { paid: true });
    await createCheckout(t.db, other.owner.ctx, professional, gw);
    expect(sessionParams()).toMatchObject({ couponId: null, allowPromotionCodes: true });
  });

  it('still offers it after a first checkout that never paid', async () => {
    await joinCohort(org.orgId);
    await subscriptionRow('incomplete_expired');
    // Its first payment failed and it was canceled before anyone paid.
    await subscriptionRow('canceled');
    await createCheckout(t.db, org.owner.ctx, professional, gw);
    expect(sessionParams().couponId).toBe('founding_50_six_months');
  });

  it('ignores a founding code, needs none before launch, and never applies founding_30_forever', async () => {
    await createCheckout(
      t.db,
      org.owner.ctx,
      { ...professional, foundingCode: 'EE-0000-0000' },
      gw,
    );
    expect(sessionParams()).toMatchObject({ couponId: null, allowPromotionCodes: true });

    await joinCohort(org.orgId);
    await setSetting(t.db, 'launch.public_at', '2027-01-15T00:00:00.000Z', { operatorId });
    await createCheckout(t.db, org.owner.ctx, { ...professional, foundingCode: 'nonsense' }, gw);
    expect(sessionParams().couponId).toBe('founding_50_six_months');

    const coupons = gw.callsTo('createCheckoutSession').map(([p]) => (p as CheckoutParams).couponId);
    expect(coupons).not.toContain('founding_30_forever');
    expect(
      await queryRows(t.db, sql`select 1 from app.founding_codes where held_by_org_id is not null`),
    ).toEqual([]);
  });

  it('replaces the open session when the interval, and so the coupon, changes', async () => {
    await joinCohort(org.orgId);
    const monthly = await createCheckout(t.db, org.owner.ctx, professional, gw);
    const annual = await createCheckout(t.db, org.owner.ctx, { ...professional, interval: 'year' }, gw);
    expect(annual.url).not.toBe(monthly.url);
    expect(sessionParams().couponId).toBe('founding_50_first_year');
    expect(gw.callsTo('expireCheckoutSession')).toEqual([[monthly.url.split('/').pop()]]);
  });
});

describe('createCheckout', () => {
  it('allows promotion codes, with no coupon and no trial, for a host outside the cohort', async () => {
    await createCheckout(t.db, org.owner.ctx, professional, gw);
    expect(sessionParams()).toMatchObject({
      allowPromotionCodes: true,
      couponId: null,
      trialEnd: null,
    });
    expect(sessionParams().metadata).toEqual({ orgId: org.orgId });
  });

  it('buys the tier and the extra slots', async () => {
    await createCheckout(t.db, org.owner.ctx, { ...professional, extraSlots: 2 }, gw);
    expect(sessionParams().items).toEqual([
      { lookupKey: 'professional_month', quantity: 1 },
      { lookupKey: 'slot_professional_month', quantity: 2 },
    ]);
  });

  it('refuses a checkout while a subscription is current', async () => {
    await subscriptionRow('trialing');
    await expect(createCheckout(t.db, org.owner.ctx, professional, gw)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'has_subscription' },
    });
  });

  it('reuses the open session for the same parameters, and replaces it when they change', async () => {
    const first = await createCheckout(t.db, org.owner.ctx, professional, gw);
    const again = await createCheckout(t.db, org.owner.ctx, professional, gw);
    expect(again.url).toBe(first.url);
    expect(gw.callsTo('createCheckoutSession')).toHaveLength(1);

    const firstId = first.url.split('/').pop();
    const changed = await createCheckout(t.db, org.owner.ctx, { ...professional, extraSlots: 1 }, gw);
    expect(changed.url).not.toBe(first.url);
    expect(gw.callsTo('createCheckoutSession')).toHaveLength(2);
    expect(gw.callsTo('expireCheckoutSession')).toEqual([[firstId]]);
  });

  it('keys the session by org, parameters and expiry', async () => {
    await createCheckout(t.db, org.owner.ctx, professional, gw);
    const [, key] = gw.callsTo('createCheckoutSession')[0] ?? [];
    const unix = Math.floor((FIXED_NOW.getTime() + 31 * 60_000) / 1000);
    expect(key).toMatch(new RegExp(`^checkout:${org.orgId}:[0-9a-f]{64}:${unix}$`));
  });

  it('leaves no open session behind when Stripe fails', async () => {
    await joinCohort(org.orgId);
    gw.failNext('createCheckoutSession');
    await expect(createCheckout(t.db, org.owner.ctx, professional, gw)).rejects.toMatchObject({
      code: 'internal',
      message: 'Billing is temporarily unavailable. Try again in a few minutes.',
    });
    const [account] = await queryRows<{ open_checkout_expires_at: string | null }>(
      t.db,
      sql`select open_checkout_expires_at::text from app.billing_accounts
          where org_id = ${org.orgId}::uuid`,
    );
    expect(account?.open_checkout_expires_at).toBeNull();
    // The founding discount is still there for the next try.
    await createCheckout(t.db, org.owner.ctx, professional, gw);
    expect(sessionParams().couponId).toBe('founding_50_six_months');
  });
});

describe('ensureStripeCustomer', () => {
  it('creates the customer once, keyed by the org', async () => {
    const a = await ensureStripeCustomer(t.db, org.orgId, gw);
    const b = await ensureStripeCustomer(t.db, org.orgId, gw);
    expect(b).toBe(a);
    const calls = gw.callsTo('createCustomer');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toMatchObject({
      orgId: org.orgId,
      name: 'Kettle Ridge Lodge',
      email: org.owner.email,
    });
    expect(calls[0]?.[1]).toBe(`customer:${org.orgId}`);
  });
});
