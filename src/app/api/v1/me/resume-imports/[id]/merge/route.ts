// POST /api/v1/me/resume-imports/{id}/merge (SP4 spec 5). W0 contract stub: W3 implements the handler
// (Task 17). The apiRoute options below are the contract; keep them.
import { mergeImportSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: mergeImportSchema,
  openapi: {
    method: 'POST',
    path: '/api/v1/me/resume-imports/{id}/merge',
    summary: 'Save the reviewed fields of a resume import',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
