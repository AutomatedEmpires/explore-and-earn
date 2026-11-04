// POST /api/v1/team/invitations/accept: the signed-in user joins the team they were invited
// to. 403 `email_mismatch`; 409 `seeker_account`, `expired` or `seat_limit`. A user without an
// account type becomes a host only once every check has passed (inside acceptInvitation).
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { clerkAdmin } from '@/modules/identity';
import { kickWorker } from '@/modules/jobs';
import { acceptInvitation } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'user',
  input: z.object({ token: z.string().min(1).max(200) }),
  openapi: {
    method: 'POST',
    path: '/api/v1/team/invitations/accept',
    summary: 'Accept a team invitation',
    output: z.object({ redirectTo: z.literal('/host') }),
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const result = await acceptInvitation(db, clerkAdmin(), user, input.token);
    kickWorker();
    return result;
  },
});
