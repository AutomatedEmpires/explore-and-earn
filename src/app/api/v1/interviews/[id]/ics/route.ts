// GET /api/v1/interviews/{id}/ics. The owner replaces the handler.
import { idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'user',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/interviews/{id}/ics', summary: 'Interview calendar file' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
