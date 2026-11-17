// PUT/DELETE /api/v1/host/candidates/{candidateId}/hide. The owner replaces the handler.
import { candidateParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'host',
  input: candidateParamSchema,
  openapi: { method: 'PUT', path: '/api/v1/host/candidates/{candidateId}/hide', summary: 'Hide a candidate' },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const DELETE = apiRoute({
  auth: 'host',
  input: candidateParamSchema,
  openapi: { method: 'DELETE', path: '/api/v1/host/candidates/{candidateId}/hide', summary: 'Unhide a candidate' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
