// PUT /api/v1/me/applications/{id}/additional-step (SP4 spec 5). W0 contract stub: W4 implements the handler
// (Task 21). The apiRoute options below are the contract; keep them.
import { additionalStepSchema } from '@/modules/applications';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'seeker',
  input: additionalStepSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/applications/{id}/additional-step',
    summary: "Mark the employer's form done or not done",
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
