// POST /api/v1/host/billing/preview: what a plan change costs, its new limits, and how many
// listings must be chosen to keep. Owner and Admin (billing.plan).
import { z } from 'zod';
import { previewChange } from '@/modules/billing';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const input = z.object({
  plan: z.enum(['starter', 'professional', 'enterprise']),
  interval: z.enum(['month', 'year']),
  extraSlots: z.number().int().min(0).max(50),
});

export const POST = apiRoute({
  auth: 'host',
  input,
  handler: async ({ db, host, input }) => {
    if (!host) throw new Error('host auth did not run');
    requireCapability(host, 'billing.plan');
    return previewChange(db, host.orgId, input);
  },
});
