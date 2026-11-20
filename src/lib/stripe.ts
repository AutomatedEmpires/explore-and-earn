// The Stripe client (server only). Billing calls go through the billing module's gateway, which
// uses this client; nothing else should construct one.
import Stripe from 'stripe';
import { getEnv } from './env';

/**
 * The API version the installed SDK declares as its latest. Pinned so a Dashboard upgrade never
 * changes response shapes under us; typed as the SDK's own literal so an SDK upgrade that moves
 * the version fails the typecheck until this line is updated.
 */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-09-30.endive';

let cached: { key: string; client: Stripe } | undefined;

/** The cached Stripe client. Throws while BILLING_PROVIDER=stub. */
export function getStripe(): Stripe {
  const env = getEnv();
  if (env.BILLING_PROVIDER !== 'stripe' || !env.STRIPE_SECRET_KEY) {
    throw new Error(`Stripe is not configured (BILLING_PROVIDER=${env.BILLING_PROVIDER})`);
  }
  if (cached?.key !== env.STRIPE_SECRET_KEY) {
    cached = {
      key: env.STRIPE_SECRET_KEY,
      client: new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: STRIPE_API_VERSION,
        maxNetworkRetries: 2,
        appInfo: { name: 'Explore&Earn' },
      }),
    };
  }
  return cached.client;
}
