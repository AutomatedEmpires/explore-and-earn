// GET /api/v1/host/threads.
import { unauthorized } from '@/lib/errors';
import { hostThreadsQuerySchema } from '@/lib/messaging';
import { listThreads } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: hostThreadsQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/threads', summary: 'List host threads' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    return listThreads(db, { kind: 'host', ctx: host }, input);
  },
});
