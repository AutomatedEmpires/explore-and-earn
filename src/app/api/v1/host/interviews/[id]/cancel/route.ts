// POST /api/v1/host/interviews/{id}/cancel.
import { unauthorized } from '@/lib/errors';
import { cancelInterviewSchema, idParamSchema } from '@/lib/hiring';
import { cancelInterview } from '@/modules/hiring';
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
  input: cancelInterviewSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/host/interviews/{id}/cancel', summary: 'Cancel an interview' },
  handler: async ({ db, host, input }) => {
    const interview = await cancelInterview(db, hostOf(host), input.id, input);
    return { interview };
  },
});
