// The Stripe catalog (SP2 spec section 8.1): three plan products with their tier and extra-slot
// prices (monthly and annual, by lookup key), the founding coupon, and the two Billing Portal
// configurations (SP2 plan, decision 10). `pnpm stripe:seed` runs it; it is idempotent by
// lookup key, coupon id and the portal metadata `ee_portal`.
import type Stripe from 'stripe';
import {
  BILLING_INTERVALS,
  FOUNDING_COUPON_ID,
  PLAN_CODES,
  lookupKey,
  unitAmountCents,
  type BillingInterval,
  type LookupKind,
  type PlanCode,
} from './plans';

export type CatalogPrice = { id: string; lookupKey: string; unitAmountCents: number };

export type PortalKind = 'full' | 'billing';

export type PortalConfigurationInput = {
  kind: PortalKind;
  headline: string;
  metadata: Record<string, string>;
  features: {
    paymentMethodUpdate: boolean;
    invoiceHistory: boolean;
    /** Cancel at the end of the period (never immediately). */
    cancelAtPeriodEnd: boolean;
    /** Always false: plan changes go through /host/billing/change and its keep list. */
    planSwitching: false;
  };
};

/** The few Stripe catalog calls the seed needs, so tests can run it in memory. */
export interface CatalogApi {
  listProducts(): Promise<{ id: string; metadata: Record<string, string> }[]>;
  createProduct(p: { name: string; metadata: Record<string, string> }): Promise<{ id: string }>;
  listPrices(lookupKeys: string[]): Promise<CatalogPrice[]>;
  createPrice(p: {
    productId: string;
    lookupKey: string;
    unitAmountCents: number;
    interval: BillingInterval;
    nickname: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string }>;
  getCoupon(id: string): Promise<{ id: string } | null>;
  createCoupon(c: {
    id: string;
    name: string;
    percentOff: number;
    duration: 'forever';
  }): Promise<{ id: string }>;
  listPortalConfigurations(): Promise<{ id: string; metadata: Record<string, string> }[]>;
  createPortalConfiguration(c: PortalConfigurationInput): Promise<{ id: string }>;
}

const PRODUCT_NAMES: Record<PlanCode, string> = {
  starter: 'Explore&Earn Starter',
  professional: 'Explore&Earn Professional',
  enterprise: 'Explore&Earn Enterprise',
};

const PLAN_NAMES: Record<PlanCode, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

const PORTALS: PortalConfigurationInput[] = [
  {
    kind: 'full',
    headline: 'Manage your Explore&Earn billing',
    metadata: { ee_portal: 'full' },
    features: {
      paymentMethodUpdate: true,
      invoiceHistory: true,
      cancelAtPeriodEnd: true,
      planSwitching: false,
    },
  },
  {
    kind: 'billing',
    headline: 'Your Explore&Earn invoices and payment method',
    metadata: { ee_portal: 'billing' },
    features: {
      paymentMethodUpdate: true,
      invoiceHistory: true,
      cancelAtPeriodEnd: false,
      planSwitching: false,
    },
  },
];

export async function seedStripeCatalog(
  api: CatalogApi,
): Promise<{ created: string[]; portalConfigFull: string; portalConfigBilling: string }> {
  const created: string[] = [];

  // Products, one per plan, found again by metadata ee_plan.
  const products = await api.listProducts();
  const productIds = {} as Record<PlanCode, string>;
  for (const plan of PLAN_CODES) {
    const existing = products.find((p) => p.metadata.ee_plan === plan);
    if (existing) {
      productIds[plan] = existing.id;
    } else {
      const { id } = await api.createProduct({
        name: PRODUCT_NAMES[plan],
        metadata: { ee_plan: plan },
      });
      productIds[plan] = id;
      created.push(`product:${plan}`);
    }
  }

  // Prices, by lookup key: the tier and the extra slot, monthly and annual.
  const wanted: { kind: LookupKind; plan: PlanCode; interval: BillingInterval; key: string }[] =
    [];
  for (const kind of ['tier', 'slot'] as const) {
    for (const plan of PLAN_CODES) {
      for (const interval of BILLING_INTERVALS) {
        wanted.push({ kind, plan, interval, key: lookupKey(kind, plan, interval) });
      }
    }
  }
  const have = new Set((await api.listPrices(wanted.map((w) => w.key))).map((p) => p.lookupKey));
  for (const w of wanted) {
    if (have.has(w.key)) continue;
    const per = w.interval === 'month' ? 'monthly' : 'annual';
    await api.createPrice({
      productId: productIds[w.plan],
      lookupKey: w.key,
      unitAmountCents: unitAmountCents(w.kind, w.plan, w.interval),
      interval: w.interval,
      nickname:
        w.kind === 'tier'
          ? `${PLAN_NAMES[w.plan]} (${per})`
          : `${PLAN_NAMES[w.plan]} extra listing slot (${per})`,
      metadata: { ee_kind: w.kind, ee_plan: w.plan },
    });
    created.push(`price:${w.key}`);
  }

  // The founding coupon: 30% off, forever.
  if (!(await api.getCoupon(FOUNDING_COUPON_ID))) {
    await api.createCoupon({
      id: FOUNDING_COUPON_ID,
      name: 'Founding host: 30% off for life',
      percentOff: 30,
      duration: 'forever',
    });
    created.push(`coupon:${FOUNDING_COUPON_ID}`);
  }

  // Portal configurations, found again by metadata ee_portal.
  const portals = await api.listPortalConfigurations();
  const portalIds = {} as Record<PortalKind, string>;
  for (const p of PORTALS) {
    const existing = portals.find((c) => c.metadata.ee_portal === p.kind);
    if (existing) {
      portalIds[p.kind] = existing.id;
    } else {
      portalIds[p.kind] = (await api.createPortalConfiguration(p)).id;
      created.push(`portal:${p.kind}`);
    }
  }

  return { created, portalConfigFull: portalIds.full, portalConfigBilling: portalIds.billing };
}

/** The CatalogApi over a real Stripe client. */
export function stripeCatalogApi(stripe: Stripe): CatalogApi {
  return {
    async listProducts() {
      const out: { id: string; metadata: Record<string, string> }[] = [];
      for await (const p of stripe.products.list({ limit: 100 })) {
        out.push({ id: p.id, metadata: { ...p.metadata } });
      }
      return out;
    },
    async createProduct(p) {
      return { id: (await stripe.products.create({ name: p.name, metadata: p.metadata })).id };
    },
    async listPrices(lookupKeys) {
      const list = await stripe.prices.list({ lookup_keys: lookupKeys, active: true, limit: 100 });
      return list.data.flatMap((p) =>
        p.lookup_key
          ? [{ id: p.id, lookupKey: p.lookup_key, unitAmountCents: p.unit_amount ?? 0 }]
          : [],
      );
    },
    async createPrice(p) {
      const price = await stripe.prices.create({
        product: p.productId,
        currency: 'usd',
        unit_amount: p.unitAmountCents,
        recurring: { interval: p.interval },
        lookup_key: p.lookupKey,
        nickname: p.nickname,
        metadata: p.metadata,
        tax_behavior: 'exclusive',
      });
      return { id: price.id };
    },
    async getCoupon(id) {
      try {
        return { id: (await stripe.coupons.retrieve(id)).id };
      } catch (err) {
        if ((err as { code?: string }).code === 'resource_missing') return null;
        throw err;
      }
    },
    async createCoupon(c) {
      const coupon = await stripe.coupons.create({
        id: c.id,
        name: c.name,
        percent_off: c.percentOff,
        duration: c.duration,
      });
      return { id: coupon.id };
    },
    async listPortalConfigurations() {
      const out: { id: string; metadata: Record<string, string> }[] = [];
      for await (const c of stripe.billingPortal.configurations.list({ limit: 100 })) {
        out.push({ id: c.id, metadata: { ...(c.metadata ?? {}) } });
      }
      return out;
    },
    async createPortalConfiguration(c) {
      const config = await stripe.billingPortal.configurations.create({
        business_profile: { headline: c.headline },
        metadata: c.metadata,
        features: {
          payment_method_update: { enabled: c.features.paymentMethodUpdate },
          invoice_history: { enabled: c.features.invoiceHistory },
          subscription_cancel: c.features.cancelAtPeriodEnd
            ? { enabled: true, mode: 'at_period_end', proration_behavior: 'none' }
            : { enabled: false },
          subscription_update: { enabled: false },
          customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name'] },
        },
      });
      return { id: config.id };
    },
  };
}
