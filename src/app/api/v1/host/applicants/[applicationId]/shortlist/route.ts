// POST /api/v1/host/applicants/{applicationId}/shortlist. The owner replaces the handler.
import { applicationParamSchema, shortlistSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: shortlistSchema.safeExtend(applicationParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/shortlist', summary: 'Shortlist an applicant' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
