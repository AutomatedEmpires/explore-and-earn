// POST /api/v1/host/team/transfer-ownership: the Owner makes an Admin the Owner, after
// reverifying. 409 `target_not_admin` when the member isn't an Admin.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import { requireCapability, transferOwnership } from '@/modules/orgs';
import { apiRoute } from '@/server/api';
import { requireReverification } from '@/server/reverify';

export const POST = apiRoute({
  auth: 'host',
  input: z.object({ membershipId: z.uuid() }),
  openapi: {
    method: 'POST',
    path: '/api/v1/host/team/transfer-ownership',
    summary: 'Make an Admin the Owner of the organization',
    output: z.object({ ok: z.literal(true) }),
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'org.transfer');
    await requireReverification();
    await transferOwnership(db, host, input.membershipId);
    kickWorker();
    return { ok: true as const };
  },
});
