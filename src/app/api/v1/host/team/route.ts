// GET /api/v1/host/team: the caller's team (any host role). Owners and Admins also get the
// pending invitations; everyone gets the seat count.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { getCapacity } from '@/modules/entitlements';
import { listMembers, memberJson, memberJsonSchema } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const output = z.object({
  members: z.array(memberJsonSchema),
  seats: z.object({ used: z.number().int(), limit: z.number().int() }),
});

export const GET = apiRoute({
  auth: 'host',
  openapi: {
    method: 'GET',
    path: '/api/v1/host/team',
    summary: "The organization's members and seat count",
    output,
  },
  handler: async ({ db, host }) => {
    if (!host) throw unauthorized();
    const [members, seats] = await Promise.all([
      listMembers(db, host.orgId),
      getCapacity(db, host.orgId, 'seat'),
    ]);
    return { members: members.map(memberJson), seats };
  },
});
