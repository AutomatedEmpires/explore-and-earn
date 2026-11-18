// GET /api/v1/host/invites/{id}/candidate (SP5 plan decision 16, Task 15): the seeker behind an
// Interested invite at SP4's `interested` stage -> { invite: HostInviteItem, candidate }. 404
// unless the invite is the org's, on a listing in scope, answered Interested, and revealed.
import { unauthorized } from '@/lib/errors';
import { idParamSchema } from '@/lib/hiring';
import { getInterestedCandidate } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import { privateJson } from '@/server/viewer';

export const GET = apiRoute({
  auth: 'host',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/host/invites/{id}/candidate', summary: 'Interested candidate' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'invites.send');
    return privateJson(await getInterestedCandidate(db, host, input.id));
  },
});
