// POST /api/v1/host/offers/{id}/cancel. The owner replaces the handler.
import { idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: idParamSchema,
  openapi: { method: 'POST', path: '/api/v1/host/offers/{id}/cancel', summary: 'Cancel an offer' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
