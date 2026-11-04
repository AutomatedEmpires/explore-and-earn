// Hosted Checkout (Task 13): founding codes and returning founders, trials, session reuse and
// Stripe customers. Entitlements and orgs are the W0 fakes; everything else is real.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { setSetting } from '@/modules/settings';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { FIXED_NOW, seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import { computeFoundingTrialEnd, createCheckout } from './checkout';
import { ensureStripeCustomer } from './customers';
import { createFoundingCodes, getFoundingCount } from './founding';
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

const DAY = 24 * 60 * 60 * 1000;
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
  await t.db.execute(sql`delete from app.founding_codes`);
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

async function launchAt(iso: string | null) {
  await setSetting(t.db, 'launch.public_at', iso, { operatorId });
}

async function code(): Promise<string> {
  const [c] = await createFoundingCodes(t.db, { count: 1, note: 'test', operatorId: null });
  return c ?? '';
}

async function heldUntil(): Promise<Date | null> {
  const [row] = await queryRows<{ held_until: string | null }>(
    t.db,
    sql`select held_until::text from app.founding_codes
        where held_by_org_id = ${org.orgId}::uuid and status = 'held'`,
  );
  return row?.held_until ? new Date(row.held_until) : null;
}

describe('computeFoundingTrialEnd', () => {
  it('starts the free period at launch, or now when later, and waits 729 days without one', () => {
    expect(computeFoundingTrialEnd(null, FIXED_NOW, 90)).toEqual(
      new Date(FIXED_NOW.getTime() + 729 * DAY),
    );
    const launch = new Date('2027-01-15T00:00:00Z');
    expect(computeFoundingTrialEnd(launch, FIXED_NOW, 90)).toEqual(
      new Date('2027-04-15T00:00:00Z'),
    );
    expect(computeFoundingTrialEnd(launch, new Date('2027-02-01T00:00:00Z'), 90)).toEqual(
      new Date('2027-05-02T00:00:00Z'),
    );
  });
});

describe('before launch', () => {
  it('needs a founding code', async () => {
    await expect(createCheckout(t.db, org.owner.ctx, professional, gw)).rejects.toMatchObject({
      code: 'bad_request',
      message: 'Enter your founding host code to subscribe before launch.',
      details: { reason: 'code_required' },
    });
    expect(gw.callsTo('createCheckoutSession')).toHaveLength(0);
  });

  it('refuses an invalid code', async () => {
    await expect(
      createCheckout(t.db, org.owner.ctx, { ...professional, foundingCode: 'EE-0000-0000' }, gw),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'code_invalid' } });
  });

  it('gives a valid code the founding coupon and trial, and holds it until the session expires', async () => {
    const c = await code();
    const { url } = await createCheckout(t.db, org.owner.ctx, { ...professional, foundingCode: c }, gw);
    expect(url).toContain('checkout.stripe.test');

    const p = sessionParams();
    const expiresAt = new Date(FIXED_NOW.getTime() + 31 * 60_000);
    expect(p.expiresAt).toEqual(expiresAt);
    expect(p.couponId).toBe('founding_30_forever');
    expect(p.allowPromotionCodes).toBe(false);
    expect(p.trialEnd).toEqual(computeFoundingTrialEnd(null, FIXED_NOW, 90));
    expect(p.metadata.orgId).toBe(org.orgId);
    expect(p.metadata.foundingCodeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.clientReferenceId).toBe(org.orgId);
    expect(p.successUrl).toBe(
      'http://localhost:3000/host/billing/complete?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(p.cancelUrl).toBe('http://localhost:3000/host/billing/plans');
    expect(await heldUntil()).toEqual(expiresAt);

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
    });
  });

  it('uses the stored launch date for the trial once it is set', async () => {
    await launchAt('2027-01-15T00:00:00.000Z');
    await createCheckout(t.db, org.owner.ctx, { ...professional, foundingCode: await code() }, gw);
    expect(sessionParams().trialEnd).toEqual(new Date('2027-04-15T00:00:00Z'));
  });
});

describe('after launch', () => {
  beforeEach(async () => {
    await launchAt('2026-10-01T00:00:00.000Z');
  });

  it('allows promotion codes, with no coupon and no trial, when no code is given', async () => {
    await createCheckout(t.db, org.owner.ctx, professional, gw);
    expect(sessionParams()).toMatchObject({
      allowPromotionCodes: true,
      couponId: null,
      trialEnd: null,
    });
    expect(sessionParams().metadata.foundingCodeId).toBeUndefined();
  });

  it('buys the tier and the extra slots', async () => {
    await createCheckout(t.db, org.owner.ctx, { ...professional, extraSlots: 2 }, gw);
    expect(sessionParams().items).toEqual([
      { lookupKey: 'professional_month', quantity: 1 },
      { lookupKey: 'slot_professional_month', quantity: 2 },
    ]);
  });

  it('refuses a checkout while a subscription is current', async () => {
    await t.db.execute(sql`
      insert into app.subscriptions (id, org_id, stripe_subscription_id, status, plan, interval)
      values (${newId()}, ${org.orgId}, ${`sub_${newId()}`}, 'trialing', 'starter', 'month')
    `);
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

  it('gives a founder who lapsed within the return window the coupon without a code', async () => {
    const lapsedAt = new Date(FIXED_NOW);
    lapsedAt.setUTCMonth(lapsedAt.getUTCMonth() - 6);
    await t.db.execute(sql`
      insert into app.billing_accounts (org_id, founding_status, founding_lapsed_at)
      values (${org.orgId}, 'lapsed', ${new Date(lapsedAt.getTime() + DAY)})
    `);
    await createCheckout(t.db, org.owner.ctx, professional, gw);
    expect(sessionParams()).toMatchObject({
      couponId: 'founding_30_forever',
      allowPromotionCodes: false,
    });
    // Still before launch + 90 days, so the free period applies too.
    expect(sessionParams().trialEnd).toEqual(new Date(FIXED_NOW.getTime() + 90 * DAY));

    const other = await seedHostOrg(t.db);
    await t.db.execute(sql`
      insert into app.billing_accounts (org_id, founding_status, founding_lapsed_at)
      values (${other.orgId}, 'lapsed', ${new Date(lapsedAt.getTime() - DAY)})
    `);
    await createCheckout(t.db, other.owner.ctx, professional, gw);
    expect(sessionParams()).toMatchObject({ couponId: null, allowPromotionCodes: true });
  });

  it('gives a returning founder no trial once launch + 90 days has passed', async () => {
    await launchAt('2026-07-01T00:00:00.000Z');
    await t.db.execute(sql`
      insert into app.billing_accounts (org_id, founding_status, founding_lapsed_at)
      values (${org.orgId}, 'lapsed', ${new Date(FIXED_NOW.getTime() - 30 * DAY)})
    `);
    await createCheckout(t.db, org.owner.ctx, professional, gw);
    expect(sessionParams()).toMatchObject({ couponId: 'founding_30_forever', trialEnd: null });
  });

  it('changes nothing and holds nothing when Stripe fails', async () => {
    await launchAt(null);
    const c = await code();
    gw.failNext('createCheckoutSession');
    await expect(
      createCheckout(t.db, org.owner.ctx, { ...professional, foundingCode: c }, gw),
    ).rejects.toMatchObject({
      code: 'internal',
      message: 'Billing is temporarily unavailable. Try again in a few minutes.',
    });
    expect((await getFoundingCount(t.db)).held).toBe(0);
    expect(await heldUntil()).toBeNull();
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
