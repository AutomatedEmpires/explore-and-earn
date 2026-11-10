// The real gateway's reading of a Stripe subscription (toSnapshot), over a stand-in Stripe
// client: no network call is made. Covers the two things FD-7 depends on: a price whose lookup
// key a catalog re-seed moved away is still recognized, and the first paid activation time.
import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { stripeGateway } from './gateway';

const T0 = Date.parse('2026-11-01T12:00:00Z') / 1000;
const PAID = Date.parse('2026-12-15T09:00:00Z') / 1000;

type Price = { lookup_key: string | null; metadata: Record<string, string>; interval: string };

function subscription(o: {
  status?: string;
  prices?: (Price & { quantity: number })[];
  latestInvoice?: unknown;
}) {
  const prices = o.prices ?? [
    { lookup_key: 'starter_month', metadata: {}, interval: 'month', quantity: 1 },
  ];
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: o.status ?? 'active',
    items: {
      data: prices.map((p, i) => ({
        id: `si_${i}`,
        price: {
          id: `price_${i}`,
          lookup_key: p.lookup_key,
          metadata: p.metadata,
          recurring: { interval: p.interval },
        },
        quantity: p.quantity,
        current_period_start: T0,
        current_period_end: T0 + 30 * 86_400,
      })),
    },
    trial_end: null,
    cancel_at_period_end: false,
    ended_at: null,
    start_date: T0,
    discounts: [],
    metadata: { orgId: 'org-1' },
    created: T0,
    latest_invoice: o.latestInvoice ?? null,
  };
}

function gatewayFor(sub: ReturnType<typeof subscription>) {
  const calls: unknown[][] = [];
  const stripe = {
    subscriptions: {
      retrieve: async (...args: unknown[]) => {
        calls.push(args);
        return sub;
      },
    },
  } as unknown as Stripe;
  return { gw: stripeGateway(stripe), calls };
}

describe('stripeGateway retrieveSubscription', () => {
  it('names a price whose lookup key moved by its ee_kind and ee_plan metadata', async () => {
    const { gw, calls } = gatewayFor(
      subscription({
        prices: [
          { lookup_key: 'starter_month', metadata: {}, interval: 'month', quantity: 1 },
          // An extra-slot price from before FD-7 moved slot prices to their own product.
          {
            lookup_key: null,
            metadata: { ee_kind: 'slot', ee_plan: 'starter' },
            interval: 'month',
            quantity: 2,
          },
          // A price billing doesn't own stays unknown.
          { lookup_key: null, metadata: {}, interval: 'month', quantity: 1 },
          { lookup_key: null, metadata: { ee_kind: 'slot', ee_plan: 'gold' }, interval: 'month', quantity: 1 },
        ],
      }),
    );
    const snap = await gw.retrieveSubscription('sub_1');
    expect(snap.items).toEqual([
      { lookupKey: 'starter_month', quantity: 1 },
      { lookupKey: 'slot_starter_month', quantity: 2 },
      { lookupKey: null, quantity: 1 },
      { lookupKey: null, quantity: 1 },
    ]);
    expect(calls[0]?.[1]).toMatchObject({ expand: expect.arrayContaining(['latest_invoice']) });
  });

  it('dates the first paid activation by the paid time of the invoice that created it', async () => {
    const created = {
      billing_reason: 'subscription_create',
      status_transitions: { paid_at: PAID },
    };
    const paidLate = await gatewayFor(subscription({ latestInvoice: created })).gw.retrieveSubscription(
      'sub_1',
    );
    expect(paidLate.startDate).toEqual(new Date(T0 * 1000));
    expect(paidLate.activatedAt).toEqual(new Date(PAID * 1000));

    // Never paid.
    for (const status of ['incomplete', 'incomplete_expired']) {
      const snap = await gatewayFor(
        subscription({ status, latestInvoice: { ...created, status_transitions: { paid_at: null } } }),
      ).gw.retrieveSubscription('sub_1');
      expect(snap.activatedAt).toBeNull();
    }

    // A renewal invoice, or an invoice Stripe didn't expand: the start date.
    for (const latestInvoice of [
      { billing_reason: 'subscription_cycle', status_transitions: { paid_at: PAID } },
      'in_123',
    ]) {
      const snap = await gatewayFor(subscription({ latestInvoice })).gw.retrieveSubscription('sub_1');
      expect(snap.activatedAt).toEqual(new Date(T0 * 1000));
    }
  });
});
