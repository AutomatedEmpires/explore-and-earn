// GET /api/v1/host/applicants. Scoped applicant cards and status counts.
import { unauthorized } from '@/lib/errors';
import { applicantsQuerySchema } from '@/lib/hiring';
import { listApplicants } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: applicantsQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/applicants', summary: 'List applicants' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'applicants.access');
    return listApplicants(db, host, input);
  },
});
