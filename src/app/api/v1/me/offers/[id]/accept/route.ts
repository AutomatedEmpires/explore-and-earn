// POST /api/v1/me/offers/{id}/accept. The owner replaces the handler.
import { idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: { method: 'POST', path: '/api/v1/me/offers/{id}/accept', summary: 'Accept an offer' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
