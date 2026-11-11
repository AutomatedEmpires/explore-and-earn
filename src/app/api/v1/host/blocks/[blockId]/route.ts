// DELETE /api/v1/host/blocks/{blockId} (SP4 spec 5). W0 contract stub: W5 implements the handler
// (Task 26). The apiRoute options below are the contract; keep them.
//
// Owner or admin only (spec 5); anyone else in the org gets 403, reason role_not_allowed.
import { blockIdParamSchema } from '@/modules/safety';
import { apiRoute } from '@/server/api';

export const DELETE = apiRoute({
  auth: 'host',
  input: blockIdParamSchema,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/host/blocks/{blockId}',
    summary: 'Unblock an applicant',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
