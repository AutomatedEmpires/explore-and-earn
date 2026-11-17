// POST /api/v1/me/interviews/{id}/request-times. The owner replaces the handler.
import { idParamSchema, requestTimesSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: requestTimesSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `interviews:${ctx.user?.id}`, limit: 30, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/me/interviews/{id}/request-times', summary: 'Request new interview times' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
