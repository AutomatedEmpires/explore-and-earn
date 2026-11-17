// POST /api/v1/host/interviews/{id}/propose. The owner replaces the handler.
import { idParamSchema, newRoundSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: newRoundSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `interviews:${ctx.user?.id}`, limit: 30, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/host/interviews/{id}/propose', summary: 'Propose a new interview round' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
