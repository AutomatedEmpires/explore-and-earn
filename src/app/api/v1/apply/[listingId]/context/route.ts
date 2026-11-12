// GET /api/v1/apply/{listingId}/context (SP4 spec 5): what the apply page needs before the
// seeker submits: the listing summary and its screening questions, whether they already
// applied, what their profile still lacks, and the profile exactly as the host would get it.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { unauthorized } from '@/lib/errors';
import { getApplyContext, listingIdParamSchema } from '@/modules/applications';
import { privateJson } from '@/server/viewer';

export const GET = apiRoute({
  auth: 'seeker',
  input: listingIdParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/apply/{listingId}/context',
    summary: 'Read what applying to a listing needs',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(await getApplyContext(db, user.id, input.listingId));
  },
});
