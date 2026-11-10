// The Stripe catalog (SP2 spec section 8.1, FD-6 and FD-7): per plan, a tier product with its
// monthly and annual tier prices and an extra-slot product with its slot prices (by lookup key);
// the two founding coupons; and the two Billing Portal configurations (SP2 plan, decision 10).
// `pnpm stripe:seed` runs it; it is idempotent by product metadata, lookup key, coupon id and
// the portal metadata `ee_portal`.
//
// The founding coupons apply only to the tier products, so they take 50% off the plan price and
// nothing off extra slots. That is why the slot prices live on products of their own. A slot
// price an older seed put on the tier product is replaced on the slot product, and its lookup
// key moves with it. Subscriptions still on the old price keep syncing: the gateway names a
// price without a lookup key by its ee_kind and ee_plan metadata (gateway.ts, lookupKeyOf), and
// their next plan change moves them to the new price. The retired founding_30_forever coupon is
// never created.
import type Stripe from 'stripe';
import {
  BILLING_INTERVALS,
  FOUNDING_ANNUAL_COUPON_ID,
  FOUNDING_MONTHLY_COUPON_ID,
  FOUNDING_MONTHLY_MONTHS,
  FOUNDING_PERCENT_OFF,
  PLAN_CODES,
  lookupKey,
  unitAmountCents,
  type BillingInterval,
  type LookupKind,
  type PlanCode,
} from './plans';

export type CatalogPrice = {
  id: string;
  lookupKey: string;
  unitAmountCents: number;
  productId: string;
};

export type CatalogCoupon = {
  id: string;
  name: string;
  percentOff: number;
  /** `repeating` needs durationInMonths. */
  duration: 'once' | 'repeating';
  durationInMonths?: number;
  /** The products the coupon discounts; nothing else on the invoice is. */
  appliesToProducts: string[];
};

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
    /** Moves the lookup key from the price that has it now to this one. */
    transferLookupKey?: boolean;
  }): Promise<{ id: string }>;
  getCoupon(id: string): Promise<{ id: string } | null>;
  createCoupon(c: CatalogCoupon): Promise<{ id: string }>;
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

/** The FD-7 founding coupons, each limited to the three tier products. */
function foundingCoupons(tierProductIds: string[]): CatalogCoupon[] {
  return [
    {
      id: FOUNDING_MONTHLY_COUPON_ID,
      name: `Founding host: ${FOUNDING_PERCENT_OFF}% off the plan for ${FOUNDING_MONTHLY_MONTHS} months`,
      percentOff: FOUNDING_PERCENT_OFF,
      duration: 'repeating',
      durationInMonths: FOUNDING_MONTHLY_MONTHS,
      appliesToProducts: tierProductIds,
    },
    {
      id: FOUNDING_ANNUAL_COUPON_ID,
      name: `Founding host: ${FOUNDING_PERCENT_OFF}% off the first annual term`,
      percentOff: FOUNDING_PERCENT_OFF,
      duration: 'once',
      appliesToProducts: tierProductIds,
    },
  ];
}

const productKind = (metadata: Record<string, string>): LookupKind =>
  metadata.ee_kind === 'slot' ? 'slot' : 'tier';

export async function seedStripeCatalog(
  api: CatalogApi,
): Promise<{ created: string[]; portalConfigFull: string; portalConfigBilling: string }> {
  const created: string[] = [];

  // Products, two per plan (the tier and its extra slot), found again by metadata ee_plan and
  // ee_kind. A tier product from an older seed has no ee_kind.
  const products = await api.listProducts();
  const productIds = { tier: {}, slot: {} } as Record<LookupKind, Record<PlanCode, string>>;
  for (const kind of ['tier', 'slot'] as const) {
    for (const plan of PLAN_CODES) {
      const existing = products.find(
        (p) => p.metadata.ee_plan === plan && productKind(p.metadata) === kind,
      );
      if (existing) {
        productIds[kind][plan] = existing.id;
        continue;
      }
      const { id } = await api.createProduct({
        name: kind === 'tier' ? PRODUCT_NAMES[plan] : `${PRODUCT_NAMES[plan]} extra listing slot`,
        metadata: { ee_plan: plan, ee_kind: kind },
      });
      productIds[kind][plan] = id;
      created.push(`product:${kind === 'tier' ? '' : 'slot_'}${plan}`);
    }
  }

  // Prices, by lookup key: the tier and the extra slot, monthly and annual, each on its product.
  const wanted: { kind: LookupKind; plan: PlanCode; interval: BillingInterval; key: string }[] =
    [];
  for (const kind of ['tier', 'slot'] as const) {
    for (const plan of PLAN_CODES) {
      for (const interval of BILLING_INTERVALS) {
        wanted.push({ kind, plan, interval, key: lookupKey(kind, plan, interval) });
      }
    }
  }
  const have = new Map(
    (await api.listPrices(wanted.map((w) => w.key))).map((p) => [p.lookupKey, p]),
  );
  for (const w of wanted) {
    const productId = productIds[w.kind][w.plan];
    const existing = have.get(w.key);
    if (existing?.productId === productId) continue;
    const per = w.interval === 'month' ? 'monthly' : 'annual';
    await api.createPrice({
      productId,
      lookupKey: w.key,
      unitAmountCents: unitAmountCents(w.kind, w.plan, w.interval),
      interval: w.interval,
      nickname:
        w.kind === 'tier'
          ? `${PLAN_NAMES[w.plan]} (${per})`
          : `${PLAN_NAMES[w.plan]} extra listing slot (${per})`,
      metadata: { ee_kind: w.kind, ee_plan: w.plan },
      ...(existing ? { transferLookupKey: true } : {}),
    });
    created.push(existing ? `price:${w.key}:moved` : `price:${w.key}`);
  }

  // The founding coupons (FD-7). Coupons can't be edited, so one that exists is left as it is.
  const tierProductIds = PLAN_CODES.map((plan) => productIds.tier[plan]);
  for (const coupon of foundingCoupons(tierProductIds)) {
    if (await api.getCoupon(coupon.id)) continue;
    await api.createCoupon(coupon);
    created.push(`coupon:${coupon.id}`);
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
          ? [
              {
                id: p.id,
                lookupKey: p.lookup_key,
                unitAmountCents: p.unit_amount ?? 0,
                productId: typeof p.product === 'string' ? p.product : p.product.id,
              },
            ]
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
        ...(p.transferLookupKey ? { transfer_lookup_key: true } : {}),
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
        ...(c.duration === 'repeating' ? { duration_in_months: c.durationInMonths } : {}),
        applies_to: { products: c.appliesToProducts },
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
