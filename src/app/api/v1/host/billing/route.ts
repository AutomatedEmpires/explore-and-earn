// GET /api/v1/host/billing: the org's subscription, prices, usage and founding status. Owner,
// Admin and Billing (billing.portal); Billing members get counts, never listing data.
import { getBillingOverview } from '@/modules/billing';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  handler: async ({ db, host }) => {
    if (!host) throw new Error('host auth did not run');
    requireCapability(host, 'billing.portal');
    return getBillingOverview(db, host);
  },
});
