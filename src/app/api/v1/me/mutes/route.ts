// GET /api/v1/me/mutes (SP4 spec 5 and 8.7): the hosts the signed-in seeker muted, newest
// first. Only the seeker sees their mutes.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { unauthorized } from '@/lib/errors';
import { listMutes } from '@/modules/safety';
import { privateJson } from '@/server/viewer';
import { hostNames } from '../blocks/_shared/host-names';

export const GET = apiRoute({
  auth: 'seeker',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/mutes',
    summary: 'List the hosts you muted',
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    const rows = await listMutes(db, user.id);
    const hosts = await hostNames(
      db,
      rows.map((r) => r.orgId),
    );
    return privateJson({
      items: rows.map((r) => ({
        orgId: r.orgId,
        name: hosts.get(r.orgId)?.name ?? '',
        mutedAt: r.mutedAt.toISOString(),
      })),
    });
  },
});
