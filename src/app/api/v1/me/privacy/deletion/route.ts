// POST /api/v1/me/privacy/deletion: delete the caller's account and data, after reverifying
// and typing DELETE. There is no grace period and no cancel. 409 `org_ownership` when the
// caller owns an organization that has other members.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { clerkAdmin } from '@/modules/identity';
import { kickWorker } from '@/modules/jobs';
import { requestDeletion } from '@/modules/privacy';
import { apiRoute } from '@/server/api';
import { requireRecentAuth } from '@/server/guards';

export const POST = apiRoute({
  auth: 'user',
  input: z.object({ confirm: z.literal('DELETE') }),
  openapi: {
    method: 'POST',
    path: '/api/v1/me/privacy/deletion',
    summary: 'Delete your account and data',
    output: z.object({ requestId: z.uuid(), status: z.literal('running') }),
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    await requireRecentAuth();
    const { requestId } = await requestDeletion(db, clerkAdmin(), user.id);
    kickWorker();
    return { requestId, status: 'running' as const };
  },
});
