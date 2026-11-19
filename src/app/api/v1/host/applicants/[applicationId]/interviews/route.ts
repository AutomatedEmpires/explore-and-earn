// POST /api/v1/host/applicants/{applicationId}/interviews.
import { unauthorized } from '@/lib/errors';
import { applicationParamSchema, interviewProposalSchema } from '@/lib/hiring';
import { proposeInterview } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import type { HostContext } from '@/server/guards';

function hostOf(host: HostContext | undefined): HostContext {
  if (!host) throw unauthorized();
  requireHiringCapability(host, 'applicants.access');
  return host;
}

export const POST = apiRoute({
  auth: 'host',
  input: interviewProposalSchema.safeExtend(applicationParamSchema.shape),
  rateLimit: { key: (ctx) => `interviews:${ctx.user?.id}`, limit: 30, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/interviews', summary: 'Propose an interview' },
  handler: async ({ db, host, input }) => {
    const interview = await proposeInterview(db, hostOf(host), input.applicationId, input);
    return { interview };
  },
});
