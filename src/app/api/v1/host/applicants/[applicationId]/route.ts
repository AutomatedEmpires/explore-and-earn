// GET /api/v1/host/applicants/{applicationId}. One applicant's card, snapshot, and history.
import { unauthorized } from '@/lib/errors';
import { applicationParamSchema } from '@/lib/hiring';
import { getApplicantDetail } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: applicationParamSchema,
  openapi: { method: 'GET', path: '/api/v1/host/applicants/{applicationId}', summary: 'Applicant detail' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'applicants.access');
    return getApplicantDetail(db, host, input.applicationId);
  },
});
