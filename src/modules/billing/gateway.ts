// Every Stripe call billing makes goes through a BillingGateway (SP2 plan, decision 1), the same
// pattern as Foundation's ClerkAdmin: the real gateway wraps getStripe(), and the fake
// (./gateway-fake) serves unit tests and BILLING_PROVIDER=stub.
import type Stripe from 'stripe';
import { getEnv } from '@/lib/env';
import { getStripe } from '@/lib/stripe';
import { makeFakeBillingGateway, type FakeBillingGateway } from './gateway-fake';
import { lookupKey, parseLookupKey, type BillingInterval, type PlanCode } from './plans';

export type SubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete_expired'
  | 'paused';

export type GatewayItem = { lookupKey: string; quantity: number };

/** What billing reads from a Stripe subscription. */
export type SubSnapshot = {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  items: { lookupKey: string | null; quantity: number }[];
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  /** Stripe's `start_date`: when the subscription was created, paid or not. */
  startDate: Date;
  /**
   * When the subscription first became paid: its first invoice's payment time. Later than
   * startDate when that payment came after creation (an incomplete subscription paid later).
   * Null while it has never been paid (incomplete, incomplete_expired).
   */
  activatedAt: Date | null;
  couponId: string | null;
  metadata: Record<string, string>;
  created: Date;
};

export type CheckoutParams = {
  customerId: string;
  items: GatewayItem[];
  trialEnd: Date | null;
  couponId: string | null;
  allowPromotionCodes: boolean;
  metadata: Record<string, string>;
  clientReferenceId: string;
  /** May contain `{CHECKOUT_SESSION_ID}`, which Stripe fills in. */
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
};

export type ProrationBehavior = 'always_invoice' | 'create_prorations' | 'none';

export type SubscriptionUpdate = {
  /** The complete set of items the subscription should have afterwards. */
  items?: GatewayItem[];
  trialEnd?: Date;
  prorationBehavior: ProrationBehavior;
  paymentBehavior?: 'error_if_incomplete';
  /** Removes every discount (FD-7: a founding discount ends on an interval change). */
  removeDiscounts?: boolean;
};

export type CardChecks = { hasCard: boolean; cvcCheck: string | null; postalCheck: string | null };

export type WebhookEvent = {
  id: string;
  type: string;
  objectId: string | null;
  object: Record<string, unknown>;
};

export interface BillingGateway {
  createCustomer(
    i: { orgId: string; name: string; email: string | null },
    idempotencyKey: string,
  ): Promise<{ id: string }>;
  createCheckoutSession(
    p: CheckoutParams,
    idempotencyKey: string,
  ): Promise<{ id: string; url: string; expiresAt: Date }>;
  retrieveCheckoutSession(id: string): Promise<{
    id: string;
    status: 'open' | 'complete' | 'expired';
    subscriptionId: string | null;
    metadata: Record<string, string>;
  }>;
  expireCheckoutSession(id: string): Promise<void>;
  retrieveSubscription(id: string): Promise<SubSnapshot>;
  listSubscriptionsCreatedSince(since: Date): Promise<SubSnapshot[]>;
  updateSubscription(
    id: string,
    u: SubscriptionUpdate,
    idempotencyKey: string,
  ): Promise<SubSnapshot>;
  /** Cancels immediately, without proration. */
  cancelSubscription(id: string, idempotencyKey: string): Promise<void>;
  previewInvoice(i: {
    customerId: string;
    subscriptionId: string;
    items: GatewayItem[];
    prorationBehavior: ProrationBehavior;
    /** Preview without the subscription's discounts, as SubscriptionUpdate.removeDiscounts. */
    removeDiscounts?: boolean;
  }): Promise<{ dueNowCents: number; nextInvoiceCents: number; nextInvoiceAt: Date }>;
  createPortalSession(i: {
    customerId: string;
    configurationId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  listPrices(
    lookupKeys: string[],
  ): Promise<{ lookupKey: string; unitAmountCents: number; interval: BillingInterval }[]>;
  getDefaultCardChecks(customerId: string): Promise<CardChecks>;
  /** Verifies the Stripe-Signature header on the raw body (300 s tolerance) and parses it. */
  constructEvent(rawBody: string, signature: string): WebhookEvent;
}

/** A declined card (or other card failure). Anything else a gateway throws is an outage. */
export class BillingCardError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'BillingCardError';
    this.code = code;
  }
}

export function isBillingCardError(err: unknown): err is BillingCardError {
  return err instanceof Error && err.name === 'BillingCardError';
}

// --- The real gateway ---------------------------------------------------------------------------

const WEBHOOK_TOLERANCE_SECONDS = 300;

const toDate = (unix: number) => new Date(unix * 1000);
const toUnix = (d: Date) => Math.floor(d.getTime() / 1000);

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : value.id;
}

function couponOf(discounts: Stripe.Subscription['discounts']): string | null {
  for (const d of discounts) {
    if (typeof d === 'string') continue;
    const coupon = idOf(d.source?.coupon ?? null);
    if (coupon) return coupon;
  }
  return null;
}

/**
 * The lookup key a subscription item's price stands for. A price whose key a catalog re-seed
 * moved to a replacement price (catalog.ts, transfer_lookup_key) has none any more, so its
 * `ee_kind` and `ee_plan` metadata, which the seed has always set, and its interval name it
 * instead. Subscriptions still on such a price keep syncing. Any other price gives null.
 */
function lookupKeyOf(price: Stripe.Price): string | null {
  if (price.lookup_key) return price.lookup_key;
  const kind = price.metadata?.ee_kind;
  const plan = price.metadata?.ee_plan;
  const interval = price.recurring?.interval;
  if (kind !== 'tier' && kind !== 'slot') return null;
  if (interval !== 'month' && interval !== 'year') return null;
  if (!plan) return null;
  const key = lookupKey(kind, plan as PlanCode, interval as BillingInterval);
  return parseLookupKey(key) ? key : null;
}

/**
 * When the subscription first became paid (FD-7's clock starts here): the paid time of the
 * invoice that created it, else its start date. Null while it has never been paid.
 */
function activatedAtOf(s: Stripe.Subscription): Date | null {
  if (s.status === 'incomplete' || s.status === 'incomplete_expired') return null;
  const invoice = s.latest_invoice;
  const paidAt =
    invoice && typeof invoice !== 'string' && invoice.billing_reason === 'subscription_create'
      ? invoice.status_transitions?.paid_at
      : null;
  return toDate(paidAt ?? s.start_date);
}

function toSnapshot(s: Stripe.Subscription): SubSnapshot {
  const items = s.items.data;
  // The pinned API version keeps the billing period on each item, not on the subscription.
  const starts = items.map((i) => i.current_period_start);
  const ends = items.map((i) => i.current_period_end);
  return {
    id: s.id,
    customerId: idOf(s.customer) ?? '',
    status: s.status as SubscriptionStatus,
    items: items.map((i) => ({ lookupKey: lookupKeyOf(i.price), quantity: i.quantity ?? 1 })),
    currentPeriodStart: toDate(starts.length > 0 ? Math.min(...starts) : s.start_date),
    currentPeriodEnd: toDate(ends.length > 0 ? Math.min(...ends) : s.start_date),
    trialEnd: s.trial_end === null ? null : toDate(s.trial_end),
    cancelAtPeriodEnd: s.cancel_at_period_end,
    endedAt: s.ended_at === null ? null : toDate(s.ended_at),
    startDate: toDate(s.start_date),
    activatedAt: activatedAtOf(s),
    couponId: couponOf(s.discounts),
    metadata: { ...(s.metadata ?? {}) },
    created: toDate(s.created),
  };
}

function isStripeCardError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: unknown }).type === 'StripeCardError'
  );
}

/** Rethrows a Stripe card error as a BillingCardError; anything else unchanged. */
function mapCardError(err: unknown): never {
  if (isStripeCardError(err)) {
    const e = err as { message?: string; code?: string };
    throw new BillingCardError(e.message ?? 'Your card was declined.', e.code ?? null);
  }
  throw err;
}

const SUB_EXPAND = ['discounts', 'items.data.price', 'latest_invoice'];

/** The real gateway over a Stripe client. Price ids are looked up by lookup key and cached. */
export function stripeGateway(stripe: Stripe, webhookSecret?: string): BillingGateway {
  const priceIds = new Map<string, string>();

  async function priceId(key: string): Promise<string> {
    const cached = priceIds.get(key);
    if (cached) return cached;
    const list = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    const price = list.data[0];
    if (!price) throw new Error(`No active Stripe price with lookup key ${key}`);
    priceIds.set(key, price.id);
    return price.id;
  }

  async function lineItems(items: GatewayItem[]) {
    return Promise.all(
      items.map(async (i) => ({ price: await priceId(i.lookupKey), quantity: i.quantity })),
    );
  }

  /** Stripe's item updates: keep matching prices, delete the rest, add the new ones. */
  async function itemChanges(
    current: Stripe.Subscription,
    items: GatewayItem[],
  ): Promise<Stripe.SubscriptionUpdateParams.Item[]> {
    const wanted = await lineItems(items);
    const out: Stripe.SubscriptionUpdateParams.Item[] = [];
    const kept = new Set<string>();
    for (const w of wanted) {
      const existing = current.items.data.find((i) => i.price.id === w.price);
      if (existing) {
        kept.add(existing.id);
        out.push({ id: existing.id, quantity: w.quantity });
      } else {
        out.push({ price: w.price, quantity: w.quantity });
      }
    }
    for (const i of current.items.data) if (!kept.has(i.id)) out.push({ id: i.id, deleted: true });
    return out;
  }

  return {
    async createCustomer(i, idempotencyKey) {
      const c = await stripe.customers.create(
        { name: i.name, email: i.email ?? undefined, metadata: { orgId: i.orgId } },
        { idempotencyKey },
      );
      return { id: c.id };
    },

    async createCheckoutSession(p, idempotencyKey) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: p.customerId,
          line_items: await lineItems(p.items),
          payment_method_collection: 'always',
          client_reference_id: p.clientReferenceId,
          metadata: p.metadata,
          subscription_data: {
            metadata: p.metadata,
            ...(p.trialEnd ? { trial_end: toUnix(p.trialEnd) } : {}),
          },
          ...(p.couponId
            ? { discounts: [{ coupon: p.couponId }] }
            : { allow_promotion_codes: p.allowPromotionCodes }),
          success_url: p.successUrl,
          cancel_url: p.cancelUrl,
          expires_at: toUnix(p.expiresAt),
        },
        { idempotencyKey },
      );
      if (!session.url) throw new Error('Stripe returned a Checkout session without a URL');
      return { id: session.id, url: session.url, expiresAt: toDate(session.expires_at) };
    },

    async retrieveCheckoutSession(id) {
      const s = await stripe.checkout.sessions.retrieve(id);
      return {
        id: s.id,
        status: (s.status ?? 'open') as 'open' | 'complete' | 'expired',
        subscriptionId: idOf(s.subscription),
        metadata: { ...(s.metadata ?? {}) },
      };
    },

    async expireCheckoutSession(id) {
      await stripe.checkout.sessions.expire(id);
    },

    async retrieveSubscription(id) {
      return toSnapshot(await stripe.subscriptions.retrieve(id, { expand: SUB_EXPAND }));
    },

    async listSubscriptionsCreatedSince(since) {
      const out: SubSnapshot[] = [];
      for await (const s of stripe.subscriptions.list({
        created: { gte: toUnix(since) },
        status: 'all',
        limit: 100,
        expand: ['data.discounts', 'data.latest_invoice'],
      })) {
        out.push(toSnapshot(s));
      }
      return out;
    },

    async updateSubscription(id, u, idempotencyKey) {
      const current = await stripe.subscriptions.retrieve(id);
      try {
        const updated = await stripe.subscriptions.update(
          id,
          {
            ...(u.items ? { items: await itemChanges(current, u.items) } : {}),
            ...(u.trialEnd ? { trial_end: toUnix(u.trialEnd) } : {}),
            proration_behavior: u.prorationBehavior,
            ...(u.paymentBehavior ? { payment_behavior: u.paymentBehavior } : {}),
            // An empty value clears the subscription's discounts.
            ...(u.removeDiscounts ? { discounts: '' as const } : {}),
            expand: SUB_EXPAND,
          },
          { idempotencyKey },
        );
        return toSnapshot(updated);
      } catch (err) {
        return mapCardError(err);
      }
    },

    async cancelSubscription(id, idempotencyKey) {
      await stripe.subscriptions.cancel(id, { prorate: false, invoice_now: false }, {
        idempotencyKey,
      });
    },

    async previewInvoice(i) {
      const current = await stripe.subscriptions.retrieve(i.subscriptionId);
      const items = await itemChanges(current, i.items);
      const preview = (behavior: ProrationBehavior) =>
        stripe.invoices.createPreview({
          customer: i.customerId,
          subscription: i.subscriptionId,
          subscription_details: { items, proration_behavior: behavior },
          // An empty value previews without inheriting the subscription's discounts.
          ...(i.removeDiscounts ? { discounts: '' as const } : {}),
        });
      const periodEnd = Math.min(...current.items.data.map((it) => it.current_period_end));
      if (i.prorationBehavior === 'always_invoice') {
        // The immediate proration invoice, then the renewal at the new price.
        const [now, next] = await Promise.all([preview('always_invoice'), preview('none')]);
        return {
          dueNowCents: now.amount_due,
          nextInvoiceCents: next.amount_due,
          nextInvoiceAt: toDate(next.period_end ?? periodEnd),
        };
      }
      const next = await preview(i.prorationBehavior);
      return {
        dueNowCents: 0,
        nextInvoiceCents: next.amount_due,
        nextInvoiceAt: toDate(next.period_end ?? periodEnd),
      };
    },

    async createPortalSession(i) {
      const s = await stripe.billingPortal.sessions.create({
        customer: i.customerId,
        configuration: i.configurationId,
        return_url: i.returnUrl,
      });
      return { url: s.url };
    },

    async listPrices(lookupKeys) {
      const list = await stripe.prices.list({ lookup_keys: lookupKeys, active: true, limit: 100 });
      return list.data.flatMap((p) =>
        p.lookup_key && p.unit_amount !== null && p.recurring
          ? [
              {
                lookupKey: p.lookup_key,
                unitAmountCents: p.unit_amount,
                interval: p.recurring.interval as BillingInterval,
              },
            ]
          : [],
      );
    },

    async getDefaultCardChecks(customerId) {
      const customer = await stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });
      let pm: Stripe.PaymentMethod | null = null;
      if (!customer.deleted) {
        const dpm = customer.invoice_settings?.default_payment_method;
        if (dpm && typeof dpm !== 'string') pm = dpm;
      }
      if (!pm) {
        const list = await stripe.customers.listPaymentMethods(customerId, {
          type: 'card',
          limit: 1,
        });
        pm = list.data[0] ?? null;
      }
      const card = pm?.card;
      if (!card) return { hasCard: false, cvcCheck: null, postalCheck: null };
      return {
        hasCard: true,
        cvcCheck: card.checks?.cvc_check ?? null,
        postalCheck: card.checks?.address_postal_code_check ?? null,
      };
    },

    constructEvent(rawBody, signature) {
      if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
      const evt = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
        WEBHOOK_TOLERANCE_SECONDS,
      );
      const object = evt.data.object as unknown as Record<string, unknown>;
      return {
        id: evt.id,
        type: evt.type,
        objectId: typeof object.id === 'string' ? object.id : null,
        object,
      };
    },
  };
}

// --- Choosing one -------------------------------------------------------------------------------

// Kept on globalThis so the checkout and complete routes (and dev hot reloads) share one stub.
const holder = globalThis as typeof globalThis & {
  __eeStubBillingGateway?: FakeBillingGateway;
  __eeStripeGateway?: { client: Stripe; gateway: BillingGateway };
};

/**
 * The gateway BILLING_PROVIDER selects. With `stub` it is one shared auto-complete fake per
 * process, so a session the checkout route creates is found by the complete route.
 */
export function billingGateway(): BillingGateway {
  const env = getEnv();
  if (env.BILLING_PROVIDER === 'stub') {
    holder.__eeStubBillingGateway ??= makeFakeBillingGateway({ autoComplete: true });
    return holder.__eeStubBillingGateway;
  }
  const client = getStripe();
  if (holder.__eeStripeGateway?.client !== client) {
    holder.__eeStripeGateway = {
      client,
      gateway: stripeGateway(client, env.STRIPE_WEBHOOK_SECRET),
    };
  }
  return holder.__eeStripeGateway.gateway;
}
