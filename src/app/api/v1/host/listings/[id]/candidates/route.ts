// GET /api/v1/host/listings/{id}/candidates. The owner replaces the handler.
import { candidatesQuerySchema, idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: candidatesQuerySchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'GET', path: '/api/v1/host/listings/{id}/candidates', summary: 'List candidates' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
