// GET /api/v1/apply/{listingId}/context (SP4 spec 5). W0 contract stub: W4 implements the handler
// (Task 22). The apiRoute options below are the contract; keep them.
import { listingIdParamSchema } from '@/modules/applications';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: listingIdParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/apply/{listingId}/context',
    summary: 'Read what applying to a listing needs',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
