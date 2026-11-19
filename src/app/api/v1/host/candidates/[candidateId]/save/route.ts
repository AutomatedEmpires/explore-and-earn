// PUT/DELETE /api/v1/host/candidates/{candidateId}/save (SP5 spec 5, plan Task 13): save or
// unsave a pool candidate -> { ok: true }. Another org's candidate, or one on a listing outside
// the member's scope, is 404.
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
      path: '/api/v1/host/candidates/{candidateId}/save',
      summary: on ? 'Save a candidate' : 'Unsave a candidate',
    },
    handler: async ({ db, host, input }) => {
      if (!host) throw unauthorized();
      requireHiringCapability(host, 'applicants.access');
      await setCandidateFlag(db, host, input.candidateId, 'saved', on);
      return { ok: true };
    },
  });
}

export const PUT = flag(true);
export const DELETE = flag(false);
