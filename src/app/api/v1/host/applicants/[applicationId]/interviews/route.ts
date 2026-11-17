// POST /api/v1/host/applicants/{applicationId}/interviews. The owner replaces the handler.
import { applicationParamSchema, interviewProposalSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: interviewProposalSchema.safeExtend(applicationParamSchema.shape),
  rateLimit: { key: (ctx) => `interviews:${ctx.user?.id}`, limit: 30, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/interviews', summary: 'Propose an interview' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
