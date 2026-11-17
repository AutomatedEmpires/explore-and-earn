// POST /api/v1/reports (SP4 spec 5). W0 contract stub: W5 implements the handler
// (Task 26). The apiRoute options below are the contract; keep them.
import { reportSchema, RATE_LIMITS } from '@/modules/safety';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'user',
  input: reportSchema,
  rateLimit: {
    key: (c) => `${RATE_LIMITS.reports.key}:${c.user?.id}`,
    limit: RATE_LIMITS.reports.limit,
    windowSec: RATE_LIMITS.reports.windowSec,
  },
  openapi: {
    method: 'POST',
    path: '/api/v1/reports',
    summary: 'Report a listing, host, profile or message',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
