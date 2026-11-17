// GET /api/v1/host/home. The owner replaces the handler.
import { homeQuerySchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: homeQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/home', summary: 'Host hiring home' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
