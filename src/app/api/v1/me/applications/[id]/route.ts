// GET /api/v1/me/applications/{id} (SP4 spec 5). W0 contract stub: W4 implements the handler
// (Task 22). The apiRoute options below are the contract; keep them.
import { idParamSchema } from '@/modules/applications';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/me/applications/{id}',
    summary: 'Read your application receipt',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
