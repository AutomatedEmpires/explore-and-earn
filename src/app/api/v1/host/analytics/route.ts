// GET /api/v1/host/analytics. The owner replaces the handler.
import { analyticsQuerySchema } from '@/lib/host-analytics';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: analyticsQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/analytics', summary: 'Host analytics' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
