// POST /api/v1/me/interviews/{id}/decline. The owner replaces the handler.
import { declineInterviewSchema, idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: declineInterviewSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/me/interviews/{id}/decline', summary: 'Decline an interview' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
