// GET /api/v1/me/interviews.
import { unauthorized } from '@/lib/errors';
import { cursorQuerySchema } from '@/lib/hiring';
import { listSeekerInterviews } from '@/modules/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: cursorQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/me/interviews', summary: 'List my interviews' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return listSeekerInterviews(db, user.id, input);
  },
});
