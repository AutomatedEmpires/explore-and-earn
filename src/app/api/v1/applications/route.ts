// POST /api/v1/applications (SP4 spec 5). W0 contract stub: W4 implements the handler
// (Task 20). The apiRoute options below are the contract; keep them.
import { submitApplicationSchema, RATE_LIMITS } from '@/modules/applications';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: submitApplicationSchema,
  rateLimit: {
    key: (c) => `${RATE_LIMITS.apply.key}:${c.user?.id}`,
    limit: RATE_LIMITS.apply.limit,
    windowSec: RATE_LIMITS.apply.windowSec,
  },
  openapi: {
    method: 'POST',
    path: '/api/v1/applications',
    summary: 'Apply to a listing',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
