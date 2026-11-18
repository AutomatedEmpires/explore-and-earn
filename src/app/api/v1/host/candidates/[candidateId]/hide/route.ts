// PUT/DELETE /api/v1/host/candidates/{candidateId}/hide (SP5 spec 5, plan Task 13): hide or
// unhide a pool candidate -> { ok: true }. A hidden candidate leaves the "all" view. Another
// org's candidate, or one on a listing outside the member's scope, is 404.
import { unauthorized } from '@/lib/errors';
import { candidateParamSchema } from '@/lib/hiring';
import { setCandidateFlag } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

function flag(on: boolean) {
  return apiRoute({
    auth: 'host',
    input: candidateParamSchema,
    openapi: {
      method: on ? 'PUT' : 'DELETE',
      path: '/api/v1/host/candidates/{candidateId}/hide',
      summary: on ? 'Hide a candidate' : 'Unhide a candidate',
    },
    handler: async ({ db, host, input }) => {
      if (!host) throw unauthorized();
      requireHiringCapability(host, 'applicants.access');
      await setCandidateFlag(db, host, input.candidateId, 'hidden', on);
      return { ok: true };
    },
  });
}

export const PUT = flag(true);
export const DELETE = flag(false);
