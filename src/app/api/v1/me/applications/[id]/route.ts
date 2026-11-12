// GET /api/v1/me/applications/{id} (SP4 spec 5): the seeker's receipt for one of their own
// applications. Anyone else's is a 404.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { unauthorized } from '@/lib/errors';
import { getReceipt, idParamSchema } from '@/modules/applications';
import { privateJson } from '@/server/viewer';

export const GET = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/me/applications/{id}',
    summary: 'Read your application receipt',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(await getReceipt(db, user.id, input.id));
  },
});
