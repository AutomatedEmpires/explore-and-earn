// GET /api/v1/me/threads.
import { unauthorized } from '@/lib/errors';
import { cursorQuerySchema } from '@/lib/hiring';
import { listThreads } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: cursorQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/me/threads', summary: 'List my threads' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return listThreads(db, { kind: 'seeker', userId: user.id }, { cursor: input.cursor });
  },
});
