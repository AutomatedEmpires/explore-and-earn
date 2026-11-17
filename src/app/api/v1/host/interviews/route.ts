// GET /api/v1/host/interviews. The owner replaces the handler.
import { hostInterviewsQuerySchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: hostInterviewsQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/interviews', summary: 'List interviews' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
