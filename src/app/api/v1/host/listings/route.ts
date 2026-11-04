// /api/v1/host/listings
// GET: one page of the org's listings in a tab, within the member's scope
// { tab: 'active'|'drafts'|'library', q?, locationId?, before? }
// -> { items: ListingRow[], nextBefore, slots: { used, limit } }.
// POST: create a listing, blank, as a copy of a past listing, or from a pasted job post
// (paste is limited to 20 an hour per org) -> { id, openSection }.
import { z } from 'zod';
import { rateLimited, unauthorized } from '@/lib/errors';
import { consume } from '@/lib/rate-limit';
import { createListing, createListingSchema, listOrgListings } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: z.object({
    tab: z.enum(['active', 'drafts', 'library']),
    q: z.string().trim().max(100).optional(),
    locationId: z.uuid().optional(),
    before: z.uuid().optional(),
  }),
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    return listOrgListings(db, host, input);
  },
});

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
