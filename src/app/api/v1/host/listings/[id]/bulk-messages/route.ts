// POST /api/v1/host/listings/{id}/bulk-messages. The owner replaces the handler.
import { bulkMessageSchema, idParamSchema } from '@/lib/messaging';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: bulkMessageSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `bulk:${ctx.host?.orgId}`, limit: 5, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/host/listings/{id}/bulk-messages', summary: 'Send a bulk message' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
