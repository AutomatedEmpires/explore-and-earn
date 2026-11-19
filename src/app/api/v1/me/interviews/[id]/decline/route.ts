// POST /api/v1/me/interviews/{id}/decline.
import { unauthorized } from '@/lib/errors';
import { declineInterviewSchema, idParamSchema } from '@/lib/hiring';
import { declineInterview } from '@/modules/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: declineInterviewSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/me/interviews/{id}/decline', summary: 'Decline an interview' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return declineInterview(db, user.id, input.id, { alsoWithdraw: input.alsoWithdraw });
  },
});
