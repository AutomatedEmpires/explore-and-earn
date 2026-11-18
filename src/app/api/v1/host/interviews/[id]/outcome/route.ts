// POST /api/v1/host/interviews/{id}/outcome.
import { unauthorized } from '@/lib/errors';
import { idParamSchema, outcomeSchema } from '@/lib/hiring';
import { recordInterviewOutcome } from '@/modules/hiring';
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
  input: outcomeSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/host/interviews/{id}/outcome', summary: 'Record an interview outcome' },
  handler: async ({ db, host, input }) => {
    const interview = await recordInterviewOutcome(db, hostOf(host), input.id, input.outcome);
    return { interview };
  },
});
