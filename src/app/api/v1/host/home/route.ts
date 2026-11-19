// GET /api/v1/host/home. Today's applicants, interviews, and unread threads.
import { unauthorized } from '@/lib/errors';
import { homeQuerySchema } from '@/lib/hiring';
import { getHostHome } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: homeQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/home', summary: 'Host hiring home' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'applicants.access');
    return getHostHome(db, host, { tz: input.tz });
  },
});
