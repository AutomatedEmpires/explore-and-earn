// GET /api/v1/host/threads. The owner replaces the handler.
import { hostThreadsQuerySchema } from '@/lib/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: hostThreadsQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/threads', summary: 'List host threads' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
