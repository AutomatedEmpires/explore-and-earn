// POST /api/v1/host/applicants/{applicationId}/hire.
import { unauthorized } from '@/lib/errors';
import { applicationParamSchema } from '@/lib/hiring';
import { kickWorker } from '@/modules/jobs';
import { markHired } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: applicationParamSchema,
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/hire', summary: 'Mark an applicant hired' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'applicants.access');
    const result = await markHired(db, host, input.applicationId);
    kickWorker();
    return result;
  },
});
