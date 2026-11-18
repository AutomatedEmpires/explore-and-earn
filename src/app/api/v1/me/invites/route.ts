// GET /api/v1/me/invites (SP5 spec 5, plan Task 15): the seeker's delivered invites, newest
// first -> Page<SeekerInviteItem>. Invites whose note is still being scanned, or was held, are
// not listed.
import { unauthorized } from '@/lib/errors';
import { cursorQuerySchema } from '@/lib/hiring';
import { listSeekerInvites } from '@/modules/hiring';
import { apiRoute } from '@/server/api';
import { privateJson } from '@/server/viewer';

export const GET = apiRoute({
  auth: 'seeker',
  input: cursorQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/me/invites', summary: 'List my invites' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(await listSeekerInvites(db, user.id, input));
  },
});
