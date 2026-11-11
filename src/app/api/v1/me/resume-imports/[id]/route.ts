// GET · DELETE /api/v1/me/resume-imports/{id} (SP4 spec 5). W0 contract stub: W3 implements the handler
// (Task 15). The apiRoute options below are the contract; keep them.
import { idParamSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/me/resume-imports/{id}',
    summary: 'Read a resume import and its proposal',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const DELETE = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/me/resume-imports/{id}',
    summary: 'Cancel a resume import',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
