// GET /api/v1/offers/{id}/letter. The owner replaces the handler.
import { idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'user',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/offers/{id}/letter', summary: 'Offer letter' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
