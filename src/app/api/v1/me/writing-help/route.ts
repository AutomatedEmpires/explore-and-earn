// POST /api/v1/me/writing-help (SP4 spec 5). W0 contract stub: W3 implements the handler
// (Task 18). The apiRoute options below are the contract; keep them.
import { writingHelpSchema, RATE_LIMITS } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: writingHelpSchema,
  rateLimit: {
    key: (c) => `${RATE_LIMITS.writingHelp.key}:${c.user?.id}`,
    limit: RATE_LIMITS.writingHelp.limit,
    windowSec: RATE_LIMITS.writingHelp.windowSec,
  },
  openapi: {
    method: 'POST',
    path: '/api/v1/me/writing-help',
    summary: 'Get writing suggestions for a profile field',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
