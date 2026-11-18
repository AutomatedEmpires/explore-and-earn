// POST /api/v1/host/applicants/{applicationId}/offers.
import { unauthorized } from '@/lib/errors';
import { applicationParamSchema, offerInputSchema } from '@/lib/hiring';
import { sendOffer } from '@/modules/hiring';
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
  input: offerInputSchema.safeExtend(applicationParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/offers', summary: 'Send an offer' },
  handler: async ({ db, host, input }) => {
    const { applicationId, ...offer } = input;
    const sent = await sendOffer(db, hostOf(host), applicationId, offer);
    return { offer: sent };
  },
});
