// GET /api/v1/me/applications (SP4 spec 5): the signed-in seeker's applications for one My jobs
// view, newest first, with the size of all three views. `before` is the previous page's
// `nextBefore`; one from another view, or a malformed one, is a 400.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { unauthorized } from '@/lib/errors';
import { listMyApplications, myApplicationsQuerySchema } from '@/modules/applications';
import { privateJson } from '@/server/viewer';

export const GET = apiRoute({
  auth: 'seeker',
  input: myApplicationsQuerySchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/me/applications',
    summary: 'List your applications',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(await listMyApplications(db, user.id, input));
  },
});
