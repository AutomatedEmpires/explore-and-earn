// POST /api/v1/host/listings/{id}/close: close a live listing; its slot is free at once
// -> { state: 'closed' }.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import { closeListing } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: z.object({ id: z.uuid() }),
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    const result = await closeListing(db, host, input.id);
    kickWorker();
    return result;
  },
});
