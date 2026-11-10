// An in-memory BillingGateway for unit tests and BILLING_PROVIDER=stub (SP2 plan, decision 1).
// With `autoComplete`, Checkout creates the subscription at once and returns the success URL,
// so stub-billing hosts become entitled without Stripe. Test controls: completeCheckout,
// setSubscription, setCardChecks, declineNextUpdate, failNext, hooks and the `calls` log.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BillingCardError,
  type BillingGateway,
  type CardChecks,
  type CheckoutParams,
  type GatewayItem,
  type SubSnapshot,
  type SubscriptionUpdate,
} from './gateway';
import { FOUNDING_PERCENT_OFF, isFoundingCoupon, parseLookupKey, unitAmountCents } from './plans';

type Method = keyof BillingGateway;

type Session = {
  id: string;
  params: CheckoutParams;
  status: 'open' | 'complete' | 'expired';
  subscriptionId: string | null;
  url: string;
};

export type FakeBillingGateway = BillingGateway & {
  /** Every call, oldest first. */
  calls: { method: Method; args: unknown[] }[];
  /** The calls to one method, oldest first. */
  callsTo(method: Method): unknown[][];
  /** Runs before an update is applied (after declineNextUpdate and failNext are checked). */
  hooks: { updateSubscription?: (id: string, u: SubscriptionUpdate, key: string) => unknown };
  /** Completes an open session as the customer paying would; returns the subscription id. */
  completeCheckout(sessionId: string): string;
  /** Replaces (or adds) a subscription, as if it changed in Stripe. */
  setSubscription(snapshot: SubSnapshot): void;
  /** The subscription as Stripe holds it now (a copy). */
  getSubscription(id: string): SubSnapshot | undefined;
  setCardChecks(customerId: string, checks: CardChecks): void;
  /** The next updateSubscription fails with a card decline. */
  declineNextUpdate(): void;
  /** The next call to `method` throws, as an outage would. */
  failNext(method: Method): void;
  /** A Stripe-Signature value constructEvent accepts for `rawBody`. */
  signEvent(rawBody: string): string;
};

const SIGNING_SECRET = 'whsec_fake_billing_gateway';

function addInterval(from: Date, interval: 'month' | 'year'): Date {
  const d = new Date(from);
  if (interval === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

const copy = (s: SubSnapshot): SubSnapshot => ({
  ...s,
  items: s.items.map((i) => ({ ...i })),
  metadata: { ...s.metadata },
});

/**
 * An invoice's amount. A founding coupon takes FOUNDING_PERCENT_OFF off the tier items only, as
 * the seeded coupons' `applies_to` (the three tier products) does in Stripe. The fake does not
 * model the coupon's duration.
 */
function amountOf(items: { lookupKey: string | null; quantity: number }[], couponId: string | null) {
  let total = 0;
  for (const i of items) {
    const parsed = i.lookupKey ? parseLookupKey(i.lookupKey) : null;
    if (!parsed) continue;
    const amount = unitAmountCents(parsed.kind, parsed.plan, parsed.interval) * i.quantity;
    const discounted = parsed.kind === 'tier' && isFoundingCoupon(couponId);
    total += discounted ? Math.round((amount * (100 - FOUNDING_PERCENT_OFF)) / 100) : amount;
  }
  return total;
}

export function makeFakeBillingGateway(
  o: { autoComplete?: boolean; now?: () => Date } = {},
): FakeBillingGateway {
  const now = o.now ?? (() => new Date());
  // Unique across instances (like Stripe ids), so tests sharing a database never collide.
  const tag = randomBytes(4).toString('hex');
  let n = 0;
  const nextId = (prefix: string) => `${prefix}_fake${tag}_${++n}`;

  const replays = new Map<string, unknown>();
  const customers = new Map<string, { orgId: string; name: string; email: string | null }>();
  const sessions = new Map<string, Session>();
  const subs = new Map<string, SubSnapshot>();
  const cardOverrides = new Map<string, CardChecks>();
  const paidCustomers = new Set<string>();
  const failing = new Set<Method>();
  let decline = false;
  const calls: { method: Method; args: unknown[] }[] = [];

  /** Logs the call and throws when failNext asked for it. */
  function enter(method: Method, args: unknown[]): void {
    calls.push({ method, args });
    if (failing.delete(method)) throw new Error(`fake gateway: ${method} failed`);
  }

  /** Runs `fn` once per idempotency key; a replay returns the first result. */
  async function once<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
    if (replays.has(key)) return replays.get(key) as T;
    const result = await fn();
    replays.set(key, result);
    return result;
  }

  function requireSub(id: string): SubSnapshot {
    const s = subs.get(id);
    if (!s) throw new Error(`No such subscription: '${id}'`);
    return s;
  }

  function complete(sessionId: string): string {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`No such checkout session: '${sessionId}'`);
    if (session.subscriptionId) return session.subscriptionId;
    const p = session.params;
    const at = now();
    const interval = parseLookupKey(p.items[0]?.lookupKey ?? '')?.interval ?? 'month';
    const sub: SubSnapshot = {
      id: nextId('sub'),
      customerId: p.customerId,
      status: p.trialEnd ? 'trialing' : 'active',
      items: p.items.map((i) => ({ ...i })),
      currentPeriodStart: at,
      currentPeriodEnd: p.trialEnd ?? addInterval(at, interval),
      trialEnd: p.trialEnd,
      cancelAtPeriodEnd: false,
      endedAt: null,
      startDate: at,
      couponId: p.couponId,
      metadata: { ...p.metadata },
      created: at,
    };
    subs.set(sub.id, sub);
    session.status = 'complete';
    session.subscriptionId = sub.id;
    paidCustomers.add(p.customerId);
    return sub.id;
  }

  const gw: FakeBillingGateway = {
    calls,
    callsTo: (method) => calls.filter((c) => c.method === method).map((c) => c.args),
    hooks: {},

    async createCustomer(i, key) {
      enter('createCustomer', [i, key]);
      return once(key, () => {
        const id = nextId('cus');
        customers.set(id, { ...i });
        return { id };
      });
    },

    async createCheckoutSession(p, key) {
      enter('createCheckoutSession', [p, key]);
      return once(key, () => {
        const id = nextId('cs');
        const session: Session = {
          id,
          params: { ...p, items: p.items.map((i) => ({ ...i })), metadata: { ...p.metadata } },
          status: 'open',
          subscriptionId: null,
          url: o.autoComplete
            ? p.successUrl.replace('{CHECKOUT_SESSION_ID}', id)
            : `https://checkout.stripe.test/c/pay/${id}`,
        };
        sessions.set(id, session);
        if (o.autoComplete) complete(id);
        return { id, url: session.url, expiresAt: p.expiresAt };
      });
    },

    async retrieveCheckoutSession(id) {
      enter('retrieveCheckoutSession', [id]);
      const s = sessions.get(id);
      if (!s) throw new Error(`No such checkout session: '${id}'`);
      const status = s.status === 'open' && s.params.expiresAt <= now() ? 'expired' : s.status;
      return { id, status, subscriptionId: s.subscriptionId, metadata: { ...s.params.metadata } };
    },

    async expireCheckoutSession(id) {
      enter('expireCheckoutSession', [id]);
      const s = sessions.get(id);
      if (!s) throw new Error(`No such checkout session: '${id}'`);
      if (s.status !== 'open') throw new Error(`Checkout session ${id} is not open`);
      s.status = 'expired';
    },

    async retrieveSubscription(id) {
      enter('retrieveSubscription', [id]);
      return copy(requireSub(id));
    },

    async listSubscriptionsCreatedSince(since) {
      enter('listSubscriptionsCreatedSince', [since]);
      return [...subs.values()].filter((s) => s.created >= since).map(copy);
    },

    async updateSubscription(id, u, key) {
      enter('updateSubscription', [id, u, key]);
      if (decline) {
        decline = false;
        throw new BillingCardError('Your card was declined.', 'card_declined');
      }
      return once(key, async () => {
        await gw.hooks.updateSubscription?.(id, u, key);
        const s = requireSub(id);
        if (u.items) s.items = u.items.map((i: GatewayItem) => ({ ...i }));
        if (u.removeDiscounts) s.couponId = null;
        if (u.trialEnd) {
          s.trialEnd = u.trialEnd;
          if (s.status === 'trialing') s.currentPeriodEnd = u.trialEnd;
        }
        return copy(s);
      });
    },

    async cancelSubscription(id, key) {
      enter('cancelSubscription', [id, key]);
      await once(key, () => {
        const s = requireSub(id);
        if (s.status !== 'canceled') {
          s.status = 'canceled';
          s.endedAt = now();
          s.cancelAtPeriodEnd = false;
        }
      });
    },

    async previewInvoice(i) {
      enter('previewInvoice', [i]);
      const s = requireSub(i.subscriptionId);
      const next = amountOf(i.items, i.removeDiscounts ? null : s.couponId);
      const current = amountOf(s.items, s.couponId);
      return {
        dueNowCents: i.prorationBehavior === 'always_invoice' ? Math.max(0, next - current) : 0,
        nextInvoiceCents: next,
        nextInvoiceAt: s.currentPeriodEnd,
      };
    },

    async createPortalSession(i) {
      enter('createPortalSession', [i]);
      return { url: `https://billing.stripe.test/p/session/${nextId('bps')}` };
    },

    async listPrices(lookupKeys) {
      enter('listPrices', [lookupKeys]);
      return lookupKeys.flatMap((key) => {
        const p = parseLookupKey(key);
        return p
          ? [
              {
                lookupKey: key,
                unitAmountCents: unitAmountCents(p.kind, p.plan, p.interval),
                interval: p.interval,
              },
            ]
          : [];
      });
    },

    async getDefaultCardChecks(customerId) {
      enter('getDefaultCardChecks', [customerId]);
      const override = cardOverrides.get(customerId);
      if (override) return { ...override };
      return paidCustomers.has(customerId)
        ? { hasCard: true, cvcCheck: 'pass', postalCheck: 'pass' }
        : { hasCard: false, cvcCheck: null, postalCheck: null };
    },

    constructEvent(rawBody, signature) {
      enter('constructEvent', [rawBody.length]);
      const expected = Buffer.from(gw.signEvent(rawBody));
      const given = Buffer.from(signature);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        throw new Error('No signatures found matching the expected signature for payload');
      }
      const evt = JSON.parse(rawBody) as {
        id: string;
        type: string;
        data?: { object?: Record<string, unknown> };
      };
      const object = evt.data?.object ?? {};
      return {
        id: evt.id,
        type: evt.type,
        objectId: typeof object.id === 'string' ? object.id : null,
        object,
      };
    },

    completeCheckout: complete,
    setSubscription(snapshot) {
      subs.set(snapshot.id, copy(snapshot));
    },
    getSubscription(id) {
      const s = subs.get(id);
      return s ? copy(s) : undefined;
    },
    setCardChecks(customerId, checks) {
      cardOverrides.set(customerId, { ...checks });
    },
    declineNextUpdate() {
      decline = true;
    },
    failNext(method) {
      failing.add(method);
    },
    signEvent(rawBody) {
      return `t=0,v1=${createHmac('sha256', SIGNING_SECRET).update(rawBody).digest('hex')}`;
    },
  };
  return gw;
}
