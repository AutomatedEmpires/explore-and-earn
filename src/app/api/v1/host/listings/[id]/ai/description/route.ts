// POST /api/v1/host/listings/{id}/ai/description: draft a job description from the host's
// notes. Body { bullets: string[] (1-20) } -> { description }. Limited to 30 an hour per org.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { generateDescription, MAX_BULLETS } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const input = z.object({
  id: z.uuid(),
  bullets: z.array(z.string().trim().min(1).max(500)).min(1).max(MAX_BULLETS),
});

export const POST = apiRoute({
  auth: 'host',
  input,
  rateLimit: {
    key: (ctx) => `listings:describe:${ctx.host?.orgId}`,
    limit: 30,
    windowSec: 3600,
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    return generateDescription(db, host, input.id, input.bullets);
  },
});
