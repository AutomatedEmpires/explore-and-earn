// POST /api/v1/me/applications/{id}/withdraw (SP4 spec 5). W0 contract stub: W4 implements the handler
// (Task 21). The apiRoute options below are the contract; keep them.
import { withdrawSchema } from '@/modules/applications';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: withdrawSchema,
  openapi: {
    method: 'POST',
    path: '/api/v1/me/applications/{id}/withdraw',
    summary: 'Withdraw an application',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
