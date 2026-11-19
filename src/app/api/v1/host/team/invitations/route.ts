// POST /api/v1/host/team/invitations: invite someone to the team (Owner or Admin), at most 30
// an hour per organization. 409 `seat_limit` or `already_member`. The email goes out from the
// `orgs.send_invitation` job, which creates the token.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import {
  createInvitation,
  createInvitationSchema,
  invitationJson,
  invitationJsonSchema,
  requireCapability,
} from '@/modules/orgs';
import { apiRoute } from '@/server/api';
import { assertScopeInOrg } from '@/server/team-scope';

const output = z.object({ invitation: invitationJsonSchema });

export const POST = apiRoute({
  auth: 'host',
  input: createInvitationSchema,
  rateLimit: {
    key: (ctx) => `team-invitations:${ctx.host?.orgId}`,
    limit: 30,
    windowSec: 3600,
  },
  openapi: {
    method: 'POST',
    path: '/api/v1/host/team/invitations',
    summary: 'Invite someone to the team by email',
    output,
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'team.manage');
    await assertScopeInOrg(db, host.orgId, input.scope);
    const invitation = await createInvitation(db, host, input);
    kickWorker();
    return { invitation: invitationJson(invitation) };
  },
});
