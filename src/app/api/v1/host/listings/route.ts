// /api/v1/host/listings
// POST: create a listing, blank, as a copy of a past listing, or from a pasted job post
// (paste is limited to 20 an hour per org) -> { id, openSection }.
import { rateLimited, unauthorized } from '@/lib/errors';
import { consume } from '@/lib/rate-limit';
import { createListing, createListingSchema } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: createListingSchema,
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    if (input.start === 'paste') {
      const verdict = await consume(db, `listings:paste:${host.orgId}`, 20, 3600);
      if (!verdict.allowed) throw rateLimited();
    }
    return createListing(db, host, input);
  },
});
