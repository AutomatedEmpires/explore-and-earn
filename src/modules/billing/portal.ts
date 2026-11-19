// The Stripe Billing Portal (SP2 plan, decision 10). Owners and Admins get the FULL
// configuration (payment method, invoices, cancel at period end); Billing members get BILLING
// (payment method and invoices). Neither allows plan switching: plan changes go through
// /host/billing/change and its keep list.
import type { DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { can, requireCapability } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import { ensureStripeCustomer } from './customers';
import { billingGateway, type BillingGateway } from './gateway';
import { appUrl, billingUnavailable } from './internal';

export async function createPortalSession(
  db: DbOrTx,
  ctx: HostContext,
  gw: BillingGateway = billingGateway(),
): Promise<{ url: string }> {
  requireCapability(ctx, 'billing.portal');
  const env = getEnv();
  // With BILLING_PROVIDER=stub the configurations aren't set; the stub gateway ignores them.
  const configurationId = can(ctx, 'billing.plan')
    ? (env.STRIPE_PORTAL_CONFIG_FULL ?? 'bpc_stub_full')
    : (env.STRIPE_PORTAL_CONFIG_BILLING ?? 'bpc_stub_billing');
  try {
    const customerId = await ensureStripeCustomer(db, ctx.orgId, gw);
    return await gw.createPortalSession({
      customerId,
      configurationId,
      returnUrl: appUrl('/host/billing'),
    });
  } catch (err) {
    if (isAppError(err) && err.status < 500) throw err;
    logger.error('billing: portal session failed', { orgId: ctx.orgId, error: err });
    throw billingUnavailable(err);
  }
}
