// POST /api/v1/host/offers/{id}/cancel.
import { unauthorized } from '@/lib/errors';
import { idParamSchema } from '@/lib/hiring';
import { cancelOffer } from '@/modules/hiring';
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
  input: idParamSchema,
  openapi: { method: 'POST', path: '/api/v1/host/offers/{id}/cancel', summary: 'Cancel an offer' },
  handler: async ({ db, host, input }) => {
    const offer = await cancelOffer(db, hostOf(host), input.id);
    return { offer };
  },
});
