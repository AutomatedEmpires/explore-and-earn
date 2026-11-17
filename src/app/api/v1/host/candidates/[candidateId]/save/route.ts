// PUT/DELETE /api/v1/host/candidates/{candidateId}/save. The owner replaces the handler.
import { candidateParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'host',
  input: candidateParamSchema,
  openapi: { method: 'PUT', path: '/api/v1/host/candidates/{candidateId}/save', summary: 'Save a candidate' },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const DELETE = apiRoute({
  auth: 'host',
  input: candidateParamSchema,
  openapi: { method: 'DELETE', path: '/api/v1/host/candidates/{candidateId}/save', summary: 'Unsave a candidate' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
