// POST /api/v1/host/listings/{id}/checks: run the automatic checks on the draft, for the
// builder's Review step -> { errors: Issue[], warnings: Issue[], slot: { used, limit } }.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { checkListing } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: z.object({ id: z.uuid() }),
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    return checkListing(db, host, input.id);
  },
});
