// PUT /api/v1/host/page/slug: change the host page address, /hosts/<slug> (Owner or Admin). The
// old address keeps redirecting. 409 `slug_taken`; 400 `slug_reserved`.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import { changeSlug, requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'host',
  input: z.object({ slug: z.string().trim().max(200) }),
  openapi: {
    method: 'PUT',
    path: '/api/v1/host/page/slug',
    summary: 'Change the host page address',
    output: z.object({ slug: z.string() }),
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'hostpage.edit');
    const result = await changeSlug(db, host, input.slug);
    kickWorker();
    return result;
  },
});
