// GET /api/v1/me/resume.pdf (SP4 spec 5). W0 contract stub: W2 implements the handler
// (Task 14). The apiRoute options below are the contract; keep them.
import { resumeTemplateQuerySchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: resumeTemplateQuerySchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/me/resume.pdf',
    summary: 'Download your resume as a PDF',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
