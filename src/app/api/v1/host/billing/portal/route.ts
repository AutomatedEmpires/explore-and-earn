// POST /api/v1/host/billing/portal: a Stripe Billing Portal session. Owners and Admins get the
// full configuration; Billing members get invoices and payment method only (billing.portal).
import { createPortalSession } from '@/modules/billing';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  handler: async ({ db, host }) => {
    if (!host) throw new Error('host auth did not run');
    requireCapability(host, 'billing.portal');
    return createPortalSession(db, host);
  },
});
