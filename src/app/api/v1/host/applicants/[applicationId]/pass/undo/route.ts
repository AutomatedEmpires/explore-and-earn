// POST /api/v1/host/applicants/{applicationId}/pass/undo. The owner replaces the handler.
import { applicationParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: applicationParamSchema,
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/pass/undo', summary: 'Undo a pass' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
