// GET /api/v1/host/invites/{id}/candidate. The owner replaces the handler.
import { idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/host/invites/{id}/candidate', summary: 'Interested candidate' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
