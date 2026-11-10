// Plans, lookup keys and the fake gateway (Task 11).
import { afterEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { billingGateway } from './gateway';
import { makeFakeBillingGateway } from './gateway-fake';
import {
  EXTRA_SLOT_ANNUAL_MULTIPLIER,
  FOUNDING_ANNUAL_COUPON_ID,
  FOUNDING_MONTHLY_COUPON_ID,
  FOUNDING_MONTHLY_MONTHS,
  FOUNDING_PERCENT_OFF,
  PLANS,
  PLAN_CODES,
  RETIRED_FOUNDING_COUPON_ID,
  foundingCouponFor,
  isFoundingCoupon,
  lookupKey,
  monthlyEquivalentCents,
  parseLookupKey,
} from './plans';

describe('PLANS', () => {
  it('holds the section 8.1 values', () => {
    expect(PLANS).toEqual({
      starter: {
        monthlyCents: 9900,
        annualCents: 99000,
        slots: 2,
        seats: 1,
        inviteCredits: 10,
        extraSlotMonthlyCents: 3900,
      },
      professional: {
        monthlyCents: 29900,
        annualCents: 299000,
        slots: 10,
        seats: 5,
        inviteCredits: 50,
        extraSlotMonthlyCents: 2900,
      },
      enterprise: {
        monthlyCents: 59900,
        annualCents: 599000,
        slots: 30,
        seats: 15,
        inviteCredits: 150,
        extraSlotMonthlyCents: 1900,
      },
    });
    expect(EXTRA_SLOT_ANNUAL_MULTIPLIER).toBe(10);
  });
});

describe('founding coupons (FD-7)', () => {
  it('are 50% off: six months for a monthly start, the first annual term for an annual one', () => {
    expect(FOUNDING_PERCENT_OFF).toBe(50);
    expect(FOUNDING_MONTHLY_MONTHS).toBe(6);
    expect(foundingCouponFor('month')).toBe(FOUNDING_MONTHLY_COUPON_ID);
    expect(foundingCouponFor('year')).toBe(FOUNDING_ANNUAL_COUPON_ID);
    expect(FOUNDING_MONTHLY_COUPON_ID).toBe('founding_50_six_months');
    expect(FOUNDING_ANNUAL_COUPON_ID).toBe('founding_50_first_year');
  });

  it('never treat the retired founding_30_forever coupon as a founding coupon', () => {
    expect(RETIRED_FOUNDING_COUPON_ID).toBe('founding_30_forever');
    expect(isFoundingCoupon(RETIRED_FOUNDING_COUPON_ID)).toBe(false);
    expect(isFoundingCoupon(null)).toBe(false);
    expect(isFoundingCoupon(FOUNDING_MONTHLY_COUPON_ID)).toBe(true);
    expect(isFoundingCoupon(FOUNDING_ANNUAL_COUPON_ID)).toBe(true);
  });
});

describe('lookup keys', () => {
  it('names tier and slot prices', () => {
    expect(lookupKey('tier', 'professional', 'month')).toBe('professional_month');
    expect(lookupKey('slot', 'starter', 'year')).toBe('slot_starter_year');
  });

  it('round-trips all 12 keys', () => {
    const keys: string[] = [];
    for (const kind of ['tier', 'slot'] as const) {
      for (const plan of PLAN_CODES) {
        for (const interval of ['month', 'year'] as const) {
          const key = lookupKey(kind, plan, interval);
          keys.push(key);
          expect(parseLookupKey(key)).toEqual({ kind, plan, interval });
        }
      }
    }
    expect(new Set(keys).size).toBe(12);
  });

  it('rejects keys it does not own', () => {
    expect(parseLookupKey('ee_extra_seat_month')).toBeNull();
    expect(parseLookupKey('slot_gold_month')).toBeNull();
    expect(parseLookupKey('professional_week')).toBeNull();
    expect(parseLookupKey('')).toBeNull();
  });

  it('gives a monthly equivalent (annual divided by 10)', () => {
    expect(monthlyEquivalentCents('starter', 'year', 0)).toBe(9900);
    expect(monthlyEquivalentCents('starter', 'month', 1)).toBe(13800);
    expect(monthlyEquivalentCents('professional', 'year', 2)).toBe(29900 + 2 * 2900);
  });
});

describe('fake gateway', () => {
  const params = (customerId: string) => ({
    customerId,
    items: [{ lookupKey: 'professional_month', quantity: 1 }],
    trialEnd: null,
    couponId: null,
    allowPromotionCodes: true,
    metadata: { orgId: 'org-1' },
    clientReferenceId: 'org-1',
    successUrl: 'http://localhost:3000/host/billing/complete?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'http://localhost:3000/host/billing/plans',
    expiresAt: new Date(Date.now() + 31 * 60_000),
  });

  it('auto-completes Checkout and returns the success URL with the session id', async () => {
    const gw = makeFakeBillingGateway({ autoComplete: true });
    const { id: customerId } = await gw.createCustomer(
      { orgId: 'org-1', name: 'Kettle', email: null },
      'customer:org-1',
    );
    const session = await gw.createCheckoutSession(params(customerId), 'checkout:1');
    expect(session.url).toContain(session.id);
    expect(session.url).not.toContain('{CHECKOUT_SESSION_ID}');

    const found = await gw.retrieveCheckoutSession(session.id);
    expect(found.status).toBe('complete');
    expect(found.subscriptionId).not.toBeNull();
    const sub = await gw.retrieveSubscription(found.subscriptionId ?? '');
    expect(sub).toMatchObject({
      customerId,
      status: 'active',
      items: [{ lookupKey: 'professional_month', quantity: 1 }],
      metadata: { orgId: 'org-1' },
    });
  });

  it('reports a card only after a completed Checkout, and lets tests override it', async () => {
    const gw = makeFakeBillingGateway({ autoComplete: true });
    const { id: customerId } = await gw.createCustomer(
      { orgId: 'org-2', name: 'Kettle', email: null },
      'customer:org-2',
    );
    expect(await gw.getDefaultCardChecks(customerId)).toEqual({
      hasCard: false,
      cvcCheck: null,
      postalCheck: null,
    });
    await gw.createCheckoutSession(params(customerId), 'checkout:2');
    expect(await gw.getDefaultCardChecks(customerId)).toEqual({
      hasCard: true,
      cvcCheck: 'pass',
      postalCheck: 'pass',
    });
    gw.setCardChecks(customerId, { hasCard: true, cvcCheck: 'fail', postalCheck: null });
    expect(await gw.getDefaultCardChecks(customerId)).toEqual({
      hasCard: true,
      cvcCheck: 'fail',
      postalCheck: null,
    });
  });

  it('leaves a session open until completeCheckout without auto-complete', async () => {
    const gw = makeFakeBillingGateway();
    const session = await gw.createCheckoutSession(params('cus_x'), 'checkout:3');
    expect((await gw.retrieveCheckoutSession(session.id)).status).toBe('open');
    expect(await gw.getDefaultCardChecks('cus_x')).toMatchObject({ hasCard: false });
    const subId = gw.completeCheckout(session.id);
    expect(await gw.retrieveCheckoutSession(session.id)).toMatchObject({
      status: 'complete',
      subscriptionId: subId,
    });
    expect(await gw.getDefaultCardChecks('cus_x')).toMatchObject({ hasCard: true });
  });

  it('replays an idempotency key without a second effect', async () => {
    const gw = makeFakeBillingGateway();
    const a = await gw.createCustomer({ orgId: 'o', name: 'n', email: null }, 'customer:o');
    const b = await gw.createCustomer({ orgId: 'o', name: 'n', email: null }, 'customer:o');
    expect(b.id).toBe(a.id);
  });

  it('fails the next call to a method, and declines the next update with a card error', async () => {
    const gw = makeFakeBillingGateway({ autoComplete: true });
    gw.failNext('createCustomer');
    await expect(
      gw.createCustomer({ orgId: 'o', name: 'n', email: null }, 'customer:o'),
    ).rejects.toThrow();
    const { id } = await gw.createCustomer({ orgId: 'o', name: 'n', email: null }, 'customer:o');
    const session = await gw.createCheckoutSession(params(id), 'checkout:4');
    const { subscriptionId } = await gw.retrieveCheckoutSession(session.id);
    gw.declineNextUpdate();
    await expect(
      gw.updateSubscription(
        subscriptionId ?? '',
        { items: [{ lookupKey: 'enterprise_month', quantity: 1 }], prorationBehavior: 'none' },
        'change:1',
      ),
    ).rejects.toMatchObject({ name: 'BillingCardError' });
  });

  it('takes the founding discount off the plan price only, and drops it on removeDiscounts', async () => {
    const gw = makeFakeBillingGateway({ autoComplete: true });
    const session = await gw.createCheckoutSession(
      {
        ...params('cus_f'),
        items: [
          { lookupKey: 'professional_month', quantity: 1 },
          { lookupKey: 'slot_professional_month', quantity: 2 },
        ],
        couponId: FOUNDING_MONTHLY_COUPON_ID,
        allowPromotionCodes: false,
      },
      'checkout:f',
    );
    const { subscriptionId } = await gw.retrieveCheckoutSession(session.id);
    const sub = subscriptionId ?? '';
    const preview = (removeDiscounts?: boolean) =>
      gw.previewInvoice({
        customerId: 'cus_f',
        subscriptionId: sub,
        items: [
          { lookupKey: 'professional_month', quantity: 1 },
          { lookupKey: 'slot_professional_month', quantity: 2 },
        ],
        prorationBehavior: 'create_prorations',
        removeDiscounts,
      });
    expect(gw.getSubscription(sub)?.status).toBe('active');
    // 50% of the $299 tier, and the two $29 extra slots in full.
    expect((await preview()).nextInvoiceCents).toBe(14950 + 5800);
    expect((await preview(true)).nextInvoiceCents).toBe(29900 + 5800);

    await gw.updateSubscription(
      sub,
      {
        items: [{ lookupKey: 'professional_year', quantity: 1 }],
        prorationBehavior: 'none',
        removeDiscounts: true,
      },
      'change:f',
    );
    expect(gw.getSubscription(sub)?.couponId).toBeNull();
  });

  it('verifies the signatures it makes', () => {
    const gw = makeFakeBillingGateway();
    const body = JSON.stringify({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1' } },
    });
    expect(gw.constructEvent(body, gw.signEvent(body))).toMatchObject({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      objectId: 'sub_1',
    });
    expect(() => gw.constructEvent(body, 'bad')).toThrow();
  });
});

describe('billingGateway()', () => {
  afterEach(() => resetEnvCache());

  it('returns one shared auto-complete fake per process with BILLING_PROVIDER=stub', () => {
    resetEnvCache();
    expect(billingGateway()).toBe(billingGateway());
  });
});
