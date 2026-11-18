// GET /api/v1/me/invites/{id} (SP5 spec 5, plan Task 15): one of the seeker's delivered invites
// -> { invite, jobCard }, with `jobCard` null once the listing is no longer live. Anyone else's
// invite, or one not yet delivered, is 404.
import { unauthorized } from '@/lib/errors';
import { idParamSchema } from '@/lib/hiring';
import { getSeekerInvite } from '@/modules/hiring';
import { apiRoute } from '@/server/api';
import { privateJson } from '@/server/viewer';

export const GET = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/me/invites/{id}', summary: 'Invite detail' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(await getSeekerInvite(db, user.id, input.id));
  },
});
