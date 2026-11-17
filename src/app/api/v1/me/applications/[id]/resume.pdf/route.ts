// GET /api/v1/me/applications/{id}/resume.pdf (SP4 spec 5). W0 contract stub: W2 implements the handler
// (Task 14). The apiRoute options below are the contract; keep them.
import { idParamSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/me/applications/{id}/resume.pdf',
    summary: 'Download the resume you sent with an application',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
