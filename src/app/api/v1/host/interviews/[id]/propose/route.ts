// POST /api/v1/host/interviews/{id}/propose.
import { unauthorized } from '@/lib/errors';
import { idParamSchema, newRoundSchema } from '@/lib/hiring';
import { proposeNewRound } from '@/modules/hiring';
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
  input: newRoundSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `interviews:${ctx.user?.id}`, limit: 30, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/host/interviews/{id}/propose', summary: 'Propose a new interview round' },
  handler: async ({ db, host, input }) => {
    const { id, ...round } = input;
    const interview = await proposeNewRound(db, hostOf(host), id, round);
    return { interview };
  },
});
