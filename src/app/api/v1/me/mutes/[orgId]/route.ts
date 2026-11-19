// PUT · DELETE /api/v1/me/mutes/{orgId} (SP4 spec 5 and 8.7): the seeker mutes or unmutes a
// host. Muting also unfollows it; a muted host can't invite (SP5). Both are idempotent: 204.
// An unknown host is 404.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { unauthorized } from '@/lib/errors';
import { mute, orgIdParamSchema, unmute } from '@/modules/safety';

export const PUT = apiRoute({
  auth: 'seeker',
  input: orgIdParamSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/mutes/{orgId}',
    summary: 'Mute a host',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await mute(db, { userId: user.id, orgId: input.orgId });
    return undefined;
  },
});

export const DELETE = apiRoute({
  auth: 'seeker',
  input: orgIdParamSchema,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/me/mutes/{orgId}',
    summary: 'Unmute a host',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await unmute(db, { userId: user.id, orgId: input.orgId });
    return undefined;
  },
});
