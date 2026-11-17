// GET /api/v1/host/applicants/{applicationId}. The owner replaces the handler.
import { applicationParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: applicationParamSchema,
  openapi: { method: 'GET', path: '/api/v1/host/applicants/{applicationId}', summary: 'Applicant detail' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
