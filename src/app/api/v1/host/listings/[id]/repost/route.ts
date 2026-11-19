// POST /api/v1/host/listings/{id}/repost: copy a past listing into a new draft with its dates
// moved forward a year -> { id, openSection: 'review' }. 409 for a removed listing.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { repostListing } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: z.object({ id: z.uuid() }),
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    return repostListing(db, host, input.id);
  },
});
