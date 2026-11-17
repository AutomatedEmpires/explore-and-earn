// POST /api/v1/host/applicants/{applicationId}/pass. The owner replaces the handler.
import { applicationParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: applicationParamSchema,
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/pass', summary: 'Pass on an applicant' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
