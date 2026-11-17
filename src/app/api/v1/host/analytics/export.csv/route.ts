// GET /api/v1/host/analytics/export.csv. The owner replaces the handler.
import { analyticsQuerySchema } from '@/lib/host-analytics';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: analyticsQuerySchema,
  rateLimit: { key: (ctx) => `export:${ctx.user?.id}`, limit: 20, windowSec: 3600 },
  openapi: { method: 'GET', path: '/api/v1/host/analytics/export.csv', summary: 'Export host analytics' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
