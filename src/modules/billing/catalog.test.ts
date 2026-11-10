// The idempotent Stripe catalog seed (Task 11, with the FD-7 founding coupons), against an
// in-memory CatalogApi.
import { describe, expect, it } from 'vitest';
import {
  seedStripeCatalog,
  type CatalogApi,
  type CatalogCoupon,
  type CatalogPrice,
  type PortalConfigurationInput,
} from './catalog';

type MemoryPrice = Omit<CatalogPrice, 'lookupKey'> & { lookupKey: string | null; interval: string };

function memoryCatalog() {
  let n = 0;
  const id = (prefix: string) => `${prefix}_${++n}`;
  const products: { id: string; name: string; metadata: Record<string, string> }[] = [];
  const prices: MemoryPrice[] = [];
  const coupons: CatalogCoupon[] = [];
  const portals: (PortalConfigurationInput & { id: string })[] = [];

  const api: CatalogApi = {
    async listProducts() {
      return products.map((p) => ({ id: p.id, metadata: p.metadata }));
    },
    async createProduct(p) {
      const row = { id: id('prod'), ...p };
      products.push(row);
      return { id: row.id };
    },
    async listPrices(lookupKeys) {
      return prices.flatMap((p) =>
        p.lookupKey !== null && lookupKeys.includes(p.lookupKey)
          ? [{ ...p, lookupKey: p.lookupKey }]
          : [],
      );
    },
    async createPrice(p) {
      // As in Stripe: a lookup key names one price, and only transfer_lookup_key moves it.
      const holder = prices.find((x) => x.lookupKey === p.lookupKey);
      if (holder && !p.transferLookupKey) throw new Error(`lookup key ${p.lookupKey} is taken`);
      if (holder) holder.lookupKey = null;
      const row = {
        id: id('price'),
        lookupKey: p.lookupKey,
        unitAmountCents: p.unitAmountCents,
        productId: p.productId,
        interval: p.interval,
      };
      prices.push(row);
      return { id: row.id };
    },
    async getCoupon(couponId) {
      return coupons.find((c) => c.id === couponId) ?? null;
    },
    async createCoupon(c) {
      coupons.push({ ...c });
      return { id: c.id };
    },
    async listPortalConfigurations() {
      return portals.map((p) => ({ id: p.id, metadata: p.metadata }));
    },
    async createPortalConfiguration(c) {
      const row = { ...c, id: id('bpc') };
      portals.push(row);
      return { id: row.id };
    },
  };
  return { api, products, prices, coupons, portals };
}

const PLANS = ['starter', 'professional', 'enterprise'];

const productOf = (m: ReturnType<typeof memoryCatalog>, kind: string, plan: string) =>
  m.products.find((p) => p.metadata.ee_plan === plan && (p.metadata.ee_kind ?? 'tier') === kind)
    ?.id;

describe('seedStripeCatalog', () => {
  it('creates 6 products, 12 prices, the two founding coupons and two portal configurations', async () => {
    const m = memoryCatalog();
    const result = await seedStripeCatalog(m.api);

    expect(m.products).toHaveLength(6);
    expect(Object.fromEntries(m.prices.map((p) => [p.lookupKey, p.unitAmountCents]))).toEqual({
      starter_month: 9900,
      starter_year: 99000,
      professional_month: 29900,
      professional_year: 299000,
      enterprise_month: 59900,
      enterprise_year: 599000,
      slot_starter_month: 3900,
      slot_starter_year: 39000,
      slot_professional_month: 2900,
      slot_professional_year: 29000,
      slot_enterprise_month: 1900,
      slot_enterprise_year: 19000,
    });
    expect(m.prices.find((p) => p.lookupKey === 'slot_enterprise_year')?.interval).toBe('year');

    // Tier prices on the tier product, slot prices on a product of their own.
    const productOfPrice = (key: string) => m.prices.find((p) => p.lookupKey === key)?.productId;
    for (const plan of PLANS) {
      const tier = productOf(m, 'tier', plan);
      const slot = productOf(m, 'slot', plan);
      expect(tier).toBeDefined();
      expect(slot).toBeDefined();
      expect(slot).not.toBe(tier);
      for (const interval of ['month', 'year']) {
        expect(productOfPrice(`${plan}_${interval}`)).toBe(tier);
        expect(productOfPrice(`slot_${plan}_${interval}`)).toBe(slot);
      }
    }

    // FD-7: 50% off the plan price only. The coupons apply to the three tier products, so extra
    // slots (an add-on; whether add-ons qualify is an open founder question) are never discounted.
    const tierProducts = PLANS.map((p) => productOf(m, 'tier', p));
    expect(m.coupons).toEqual([
      {
        id: 'founding_50_six_months',
        name: 'Founding host: 50% off the plan for 6 months',
        percentOff: 50,
        duration: 'repeating',
        durationInMonths: 6,
        appliesToProducts: tierProducts,
      },
      {
        id: 'founding_50_first_year',
        name: 'Founding host: 50% off the first annual term',
        percentOff: 50,
        duration: 'once',
        appliesToProducts: tierProducts,
      },
    ]);
    expect(m.coupons.map((c) => c.id)).not.toContain('founding_30_forever');

    const full = m.portals.find((p) => p.metadata.ee_portal === 'full');
    const billing = m.portals.find((p) => p.metadata.ee_portal === 'billing');
    expect(full?.features).toEqual({
      paymentMethodUpdate: true,
      invoiceHistory: true,
      cancelAtPeriodEnd: true,
      planSwitching: false,
    });
    expect(billing?.features).toEqual({
      paymentMethodUpdate: true,
      invoiceHistory: true,
      cancelAtPeriodEnd: false,
      planSwitching: false,
    });
    expect(result.portalConfigFull).toBe(full?.id);
    expect(result.portalConfigBilling).toBe(billing?.id);
    expect(result.created).toHaveLength(6 + 12 + 2 + 2);
  });

  it('creates nothing on a second run and returns the same configuration ids', async () => {
    const m = memoryCatalog();
    const first = await seedStripeCatalog(m.api);
    const second = await seedStripeCatalog(m.api);

    expect(second.created).toEqual([]);
    expect(second.portalConfigFull).toBe(first.portalConfigFull);
    expect(second.portalConfigBilling).toBe(first.portalConfigBilling);
    expect(m.products).toHaveLength(6);
    expect(m.prices).toHaveLength(12);
    expect(m.coupons).toHaveLength(2);
    expect(m.portals).toHaveLength(2);
  });

  it('moves slot prices an older seed put on the tier product, keeping its tier products', async () => {
    const m = memoryCatalog();
    // The catalog as the pre-FD-7 seed left it: one product per plan, with no ee_kind, for both.
    for (const plan of PLANS) {
      const { id: productId } = await m.api.createProduct({
        name: plan,
        metadata: { ee_plan: plan },
      });
      for (const key of [`${plan}_month`, `slot_${plan}_month`]) {
        await m.api.createPrice({
          productId,
          lookupKey: key,
          unitAmountCents: 1,
          interval: 'month',
          nickname: key,
          metadata: {},
        });
      }
    }

    const result = await seedStripeCatalog(m.api);
    expect(m.products).toHaveLength(6);
    expect(result.created).toEqual(
      expect.arrayContaining([
        'product:slot_starter',
        'price:slot_starter_month:moved',
        'price:slot_enterprise_month:moved',
        'price:starter_year',
      ]),
    );
    expect(result.created).not.toContain('product:starter');
    expect(result.created).not.toContain('price:starter_month');
    expect(result.created).not.toContain('price:starter_month:moved');

    const holders = (key: string) => m.prices.filter((p) => p.lookupKey === key);
    expect(holders('slot_starter_month')).toHaveLength(1);
    expect(holders('slot_starter_month')[0]?.productId).toBe(productOf(m, 'slot', 'starter'));
    expect(holders('starter_month')[0]?.productId).toBe(productOf(m, 'tier', 'starter'));
    expect(m.coupons[0]?.appliesToProducts).toEqual(PLANS.map((p) => productOf(m, 'tier', p)));

    expect((await seedStripeCatalog(m.api)).created).toEqual([]);
  });
});
