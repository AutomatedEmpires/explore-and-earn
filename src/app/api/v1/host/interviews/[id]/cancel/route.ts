// POST /api/v1/host/interviews/{id}/cancel. The owner replaces the handler.
import { cancelInterviewSchema, idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: cancelInterviewSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/host/interviews/{id}/cancel', summary: 'Cancel an interview' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
