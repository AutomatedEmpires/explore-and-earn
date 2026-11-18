// POST /api/v1/me/invites/{id}/mute (SP5 spec 5 and 8.4, plan Task 15): mute the inviting host
// (SP4 safety) -> { invite }. An open invite reads Not interested to the host.
import { unauthorized } from '@/lib/errors';
import { idParamSchema } from '@/lib/hiring';
import { muteInviteHost } from '@/modules/hiring';
import { kickWorker } from '@/modules/jobs';
import { apiRoute } from '@/server/api';
import { privateJson } from '@/server/viewer';

export const POST = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: { method: 'POST', path: '/api/v1/me/invites/{id}/mute', summary: 'Mute an invite host' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const result = await muteInviteHost(db, user.id, input.id);
    kickWorker();
    return privateJson(result);
  },
});
