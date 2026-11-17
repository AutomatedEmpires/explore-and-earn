// POST /api/v1/me/interviews/{id}/pick. The owner replaces the handler.
import { idParamSchema, pickSlotSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: pickSlotSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `interviews:${ctx.user?.id}`, limit: 30, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/me/interviews/{id}/pick', summary: 'Pick an interview slot' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
