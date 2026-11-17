// POST /api/v1/threads/{id}/messages. The owner replaces the handler.
import { idParamSchema, sendMessageSchema } from '@/lib/messaging';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'user',
  input: sendMessageSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `messages:${ctx.user?.id}`, limit: 60, windowSec: 600 },
  openapi: { method: 'POST', path: '/api/v1/threads/{id}/messages', summary: 'Send a message' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
