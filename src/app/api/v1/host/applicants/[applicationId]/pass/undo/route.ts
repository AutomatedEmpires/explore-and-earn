// POST /api/v1/host/applicants/{applicationId}/pass/undo.
import { unauthorized } from '@/lib/errors';
import { applicationParamSchema } from '@/lib/hiring';
import { undoPass } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: applicationParamSchema,
  openapi: { method: 'POST', path: '/api/v1/host/applicants/{applicationId}/pass/undo', summary: 'Undo a pass' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'applicants.access');
    return undoPass(db, host, input.applicationId);
  },
});
