// POST /api/v1/threads/{id}/read. The owner replaces the handler.
import { idParamSchema } from '@/lib/messaging';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'user',
  input: idParamSchema,
  openapi: { method: 'POST', path: '/api/v1/threads/{id}/read', summary: 'Mark a thread read' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
