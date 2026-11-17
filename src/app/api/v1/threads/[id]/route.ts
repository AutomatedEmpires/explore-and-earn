// GET /api/v1/threads/{id}. The owner replaces the handler.
import { idParamSchema, threadQuerySchema } from '@/lib/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'user',
  input: threadQuerySchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'GET', path: '/api/v1/threads/{id}', summary: 'Read a thread' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
