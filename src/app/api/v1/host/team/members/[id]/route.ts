// /api/v1/host/team/members/[id]
// PATCH: change a member's role or recruiter scope (Owner or Admin; Admins can't change the
//   Owner or make anyone Owner).
// DELETE: remove a member (Owner or Admin), or leave the team yourself. 409
//   `owner_must_transfer` when the Owner tries to leave.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { clerkAdmin } from '@/modules/identity';
import { kickWorker } from '@/modules/jobs';
import {
  changeMember,
  changeMemberSchema,
  memberJson,
  memberJsonSchema,
  removeMember,
  requireCapability,
} from '@/modules/orgs';
import { apiRoute } from '@/server/api';
import { assertScopeInOrg } from '@/server/team-scope';

export const PATCH = apiRoute({
  auth: 'host',
  input: changeMemberSchema.extend({ id: z.uuid() }),
  openapi: {
    method: 'PATCH',
    path: '/api/v1/host/team/members/{id}',
    summary: "Change a team member's role or the listings they work on",
    output: memberJsonSchema,
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'team.manage');
    await assertScopeInOrg(db, host.orgId, input.scope);
    const member = await changeMember(db, clerkAdmin(), host, input.id, {
      role: input.role,
      scope: input.scope,
    });
    kickWorker();
    return memberJson(member);
  },
});

export const DELETE = apiRoute({
  auth: 'host',
  input: z.object({ id: z.uuid() }),
  openapi: {
    method: 'DELETE',
    path: '/api/v1/host/team/members/{id}',
    summary: 'Remove a team member, or leave the team',
    output: z.object({ ok: z.literal(true) }),
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    // Anyone may leave; removing someone else needs `team.manage` (removeMember checks it).
    await removeMember(db, clerkAdmin(), host, input.id);
    kickWorker();
    return { ok: true as const };
  },
});
