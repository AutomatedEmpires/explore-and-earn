// POST /api/v1/host/applicants/{applicationId}/shortlist.
import { unauthorized } from '@/lib/errors';
import { applicationParamSchema, shortlistSchema } from '@/lib/hiring';
import { shortlist } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: shortlistSchema.safeExtend(applicationParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/shortlist', summary: 'Shortlist an applicant' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'applicants.access');
    return shortlist(db, host, input.applicationId, input.on);
  },
});
