// `pnpm stripe:seed`: creates (or finds) the Stripe products, prices, founding coupon and Billing
// Portal configurations, then prints the two portal configuration ids for Doppler. Safe to run
// again: it creates only what is missing.
//
// Needs BILLING_PROVIDER=stripe and a Stripe key (a test key outside prod), for example:
//   doppler run --config dev -- pnpm stripe:seed
// Reads .env.local when present; variables already set in the shell take precedence.
import { existsSync } from 'node:fs';
import { logger } from '../src/lib/logger';
import { getStripe } from '../src/lib/stripe';
import { seedStripeCatalog, stripeCatalogApi } from '../src/modules/billing';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

try {
  const result = await seedStripeCatalog(stripeCatalogApi(getStripe()));
  logger.info('stripe catalog seeded', { created: result.created });
  process.stdout.write(
    `STRIPE_PORTAL_CONFIG_FULL=${result.portalConfigFull}\n` +
      `STRIPE_PORTAL_CONFIG_BILLING=${result.portalConfigBilling}\n`,
  );
} catch (err) {
  logger.error('stripe:seed failed', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
}
