// DELETE /api/v1/me/blocks/{type}/{id} (SP4 spec 5). W0 contract stub: W5 implements the handler
// (Task 26). The apiRoute options below are the contract; keep them.
import { unblockParamsSchema } from '@/modules/safety';
import { apiRoute } from '@/server/api';

export const DELETE = apiRoute({
  auth: 'seeker',
  input: unblockParamsSchema,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/me/blocks/{type}/{id}',
    summary: 'Unblock a host or a person',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
