// POST /api/v1/host/listings/{id}/confirm-active: the "Still hiring?" Yes
// -> { confirmedActiveAt }.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { confirmActive } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: z.object({ id: z.uuid() }),
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    return confirmActive(db, host, input.id);
  },
});
