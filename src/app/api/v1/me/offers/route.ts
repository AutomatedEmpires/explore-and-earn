// GET /api/v1/me/offers. The owner replaces the handler.
import { cursorQuerySchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: cursorQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/me/offers', summary: 'List my offers' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
