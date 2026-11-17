// POST /api/v1/host/interviews/{id}/outcome. The owner replaces the handler.
import { idParamSchema, outcomeSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: outcomeSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/host/interviews/{id}/outcome', summary: 'Record an interview outcome' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
