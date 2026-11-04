// POST /api/v1/host/billing/checkout: starts (or reuses) the org's hosted Stripe Checkout and
// returns its URL. Owner and Admin (billing.plan); 10 per hour per org.
import { z } from 'zod';
import { createCheckout } from '@/modules/billing';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const input = z.object({
  plan: z.enum(['starter', 'professional', 'enterprise']),
  interval: z.enum(['month', 'year']),
  extraSlots: z.number().int().min(0).max(50),
  foundingCode: z.string().trim().max(40).optional(),
});

export const POST = apiRoute({
  auth: 'host',
  input,
  rateLimit: { key: (ctx) => `billing-checkout:${ctx.host?.orgId}`, limit: 10, windowSec: 3600 },
  handler: async ({ db, host, input }) => {
    if (!host) throw new Error('host auth did not run');
    requireCapability(host, 'billing.plan');
    return createCheckout(db, host, input);
  },
});
