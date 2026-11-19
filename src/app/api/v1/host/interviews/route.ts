// GET /api/v1/host/interviews.
import { unauthorized } from '@/lib/errors';
import { hostInterviewsQuerySchema } from '@/lib/hiring';
import { listHostInterviews } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import type { HostContext } from '@/server/guards';

function hostOf(host: HostContext | undefined): HostContext {
  if (!host) throw unauthorized();
  requireHiringCapability(host, 'applicants.access');
  return host;
}

export const GET = apiRoute({
  auth: 'host',
  input: hostInterviewsQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/interviews', summary: 'List interviews' },
  handler: async ({ db, host, input }) => listHostInterviews(db, hostOf(host), input),
});
