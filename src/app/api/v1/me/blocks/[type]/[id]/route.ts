// DELETE /api/v1/me/blocks/{type}/{id} (SP4 spec 5): the seeker unblocks a host or a person.
// Idempotent: 204 whether or not the block was there. It removes only the seeker's own block,
// never one the other party made.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { unauthorized } from '@/lib/errors';
import { unblock, unblockParamsSchema } from '@/modules/safety';

export const DELETE = apiRoute({
  auth: 'seeker',
  input: unblockParamsSchema,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/me/blocks/{type}/{id}',
    summary: 'Unblock a host or a person',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await unblock(db, { type: 'user', id: user.id }, { type: input.type, id: input.id }, user.id);
    return undefined;
  },
});
