// The idempotent Stripe catalog seed (Task 11), against an in-memory CatalogApi.
import { describe, expect, it } from 'vitest';
import {
  seedStripeCatalog,
  type CatalogApi,
  type CatalogPrice,
  type PortalConfigurationInput,
} from './catalog';

function memoryCatalog() {
  let n = 0;
  const id = (prefix: string) => `${prefix}_${++n}`;
  const products: { id: string; name: string; metadata: Record<string, string> }[] = [];
  const prices: (CatalogPrice & { productId: string; interval: string })[] = [];
  const coupons: { id: string; percentOff: number; duration: string }[] = [];
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
      return prices.filter((p) => lookupKeys.includes(p.lookupKey));
    },
    async createPrice(p) {
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
      coupons.push({ id: c.id, percentOff: c.percentOff, duration: c.duration });
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

describe('seedStripeCatalog', () => {
  it('creates 3 products, 12 prices, the founding coupon and two portal configurations', async () => {
    const m = memoryCatalog();
    const result = await seedStripeCatalog(m.api);

    expect(m.products).toHaveLength(3);
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

    expect(m.coupons).toEqual([{ id: 'founding_30_forever', percentOff: 30, duration: 'forever' }]);

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
    expect(result.created).toHaveLength(3 + 12 + 1 + 2);
  });

  it('creates nothing on a second run and returns the same configuration ids', async () => {
    const m = memoryCatalog();
    const first = await seedStripeCatalog(m.api);
    const second = await seedStripeCatalog(m.api);

    expect(second.created).toEqual([]);
    expect(second.portalConfigFull).toBe(first.portalConfigFull);
    expect(second.portalConfigBilling).toBe(first.portalConfigBilling);
    expect(m.products).toHaveLength(3);
    expect(m.prices).toHaveLength(12);
    expect(m.portals).toHaveLength(2);
  });
});
