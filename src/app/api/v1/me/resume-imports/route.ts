// POST /api/v1/me/resume-imports (SP4 spec 5). W0 contract stub: W3 implements the handler
// (Task 15). The apiRoute options below are the contract; keep them.
import { createImportSchema, RATE_LIMITS } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: createImportSchema,
  rateLimit: {
    key: (c) => `${RATE_LIMITS.aiImport.key}:${c.user?.id}`,
    limit: RATE_LIMITS.aiImport.limit,
    windowSec: RATE_LIMITS.aiImport.windowSec,
  },
  openapi: {
    method: 'POST',
    path: '/api/v1/me/resume-imports',
    summary: 'Start an AI resume import',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
