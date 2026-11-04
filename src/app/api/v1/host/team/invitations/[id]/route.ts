// DELETE /api/v1/host/team/invitations/[id]: revoke a pending invitation (Owner or Admin).
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { requireCapability, revokeInvitation } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const DELETE = apiRoute({
  auth: 'host',
  input: z.object({ id: z.uuid() }),
  openapi: {
    method: 'DELETE',
    path: '/api/v1/host/team/invitations/{id}',
    summary: 'Revoke a pending team invitation',
    output: z.object({ ok: z.literal(true) }),
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'team.manage');
    await revokeInvitation(db, host, input.id);
    return { ok: true as const };
  },
});
