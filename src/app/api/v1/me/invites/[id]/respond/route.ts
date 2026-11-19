// POST /api/v1/me/invites/{id}/respond (SP5 spec 5 and 8.4, plan Task 15):
// { response: 'interested' | 'not_interested', reason? } -> { invite, threadId }. Interested
// opens the conversation; 409 `expired` past the invite's expiry, 409 `already_responded` for a
// different answer than the one recorded.
import { unauthorized } from '@/lib/errors';
import { idParamSchema, inviteResponseSchema } from '@/lib/hiring';
import { respondToInvite } from '@/modules/hiring';
import { kickWorker } from '@/modules/jobs';
import { apiRoute } from '@/server/api';
import { privateJson } from '@/server/viewer';

export const POST = apiRoute({
  auth: 'seeker',
  input: inviteResponseSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/me/invites/{id}/respond', summary: 'Respond to an invite' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const { id, ...answer } = input;
    const result = await respondToInvite(db, user.id, id, answer);
    kickWorker();
    return privateJson(result);
  },
});
