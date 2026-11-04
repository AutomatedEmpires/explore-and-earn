// POST /api/v1/host/listings/{id}/approval: an Owner or Admin approves a Recruiter's listing
// (it goes on to screening) or sends it back. Body { decision: 'approve'|'return', note? }
// -> { state, reviewStage }.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import { decideApproval } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: z.object({
    id: z.uuid(),
    decision: z.enum(['approve', 'return']),
    note: z.string().trim().max(1_000).optional(),
  }),
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.approve');
    const result = await decideApproval(db, host, input.id, input.decision, input.note);
    kickWorker();
    return result;
  },
});
