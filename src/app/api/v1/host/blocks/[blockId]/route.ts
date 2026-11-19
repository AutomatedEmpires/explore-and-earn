// DELETE /api/v1/host/blocks/{blockId} (SP4 spec 5): an Owner or Admin lifts one of the org's
// blocks. Anyone else in the org gets 403 `role_not_allowed`. A block the org didn't make
// (another org's, or a seeker's block of the org) is 404, the same as an unknown id. 204.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { forbidden } from '@/lib/errors';
import { blockIdParamSchema, unblockById } from '@/modules/safety';
import { requireBlockAdmin } from '../_shared/roles';

export const DELETE = apiRoute({
  auth: 'host',
  input: blockIdParamSchema,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/host/blocks/{blockId}',
    summary: 'Unblock an applicant',
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw forbidden();
    requireBlockAdmin(host);
    await unblockById(db, {
      blockId: input.blockId,
      by: { type: 'org', id: host.orgId },
      actorUserId: host.user.id,
    });
    return undefined;
  },
});
