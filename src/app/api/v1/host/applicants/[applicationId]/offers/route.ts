// POST /api/v1/host/applicants/{applicationId}/offers. The owner replaces the handler.
import { applicationParamSchema, offerInputSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: offerInputSchema.safeExtend(applicationParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/offers', summary: 'Send an offer' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
