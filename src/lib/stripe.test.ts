import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from './env';
import { getStripe, STRIPE_API_VERSION } from './stripe';

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('getStripe', () => {
  it('throws while BILLING_PROVIDER=stub', () => {
    vi.stubEnv('BILLING_PROVIDER', 'stub');
    resetEnvCache();
    expect(() => getStripe()).toThrow('Stripe is not configured (BILLING_PROVIDER=stub)');
  });

  it('returns one cached client for a test key', () => {
    vi.stubEnv('BILLING_PROVIDER', 'stripe');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_unit');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_unit');
    vi.stubEnv('STRIPE_PORTAL_CONFIG_FULL', 'bpc_full');
    vi.stubEnv('STRIPE_PORTAL_CONFIG_BILLING', 'bpc_billing');
    resetEnvCache();
    const first = getStripe();
    expect(getStripe()).toBe(first);
  });

  it('pins an API version', () => {
    expect(STRIPE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\w+$/);
  });
});
