// POST /api/v1/host/billing/change: changes the plan. When active and in-review listings exceed
// the new limit, keepListingIds (at most the new limit) is required. Owner and Admin
// (billing.plan). 400 keep_list_required; 409 seat_limit or change_in_progress.
import { z } from 'zod';
import { changePlan } from '@/modules/billing';
import { kickWorker } from '@/modules/jobs';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const input = z.object({
  plan: z.enum(['starter', 'professional', 'enterprise']),
  interval: z.enum(['month', 'year']),
  extraSlots: z.number().int().min(0).max(50),
  keepListingIds: z.array(z.uuid()).max(80).optional(),
});

export const POST = apiRoute({
  auth: 'host',
  input,
  handler: async ({ db, host, input }) => {
    if (!host) throw new Error('host auth did not run');
    requireCapability(host, 'billing.plan');
    const result = await changePlan(db, {
      orgId: host.orgId,
      ...input,
      actorUserId: host.user.id,
    });
    kickWorker();
    return result;
  },
});
