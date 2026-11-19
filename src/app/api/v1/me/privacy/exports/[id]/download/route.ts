// GET /api/v1/me/privacy/exports/{id}/download: redirects the owner to a fresh 300-second
// signed URL. 404 for anyone else's request, 409 `not_ready` while it is prepared, 410 once
// the download has expired.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { getExportDownload } from '@/modules/privacy';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'user',
  input: z.object({ id: z.string() }),
  openapi: {
    method: 'GET',
    path: '/api/v1/me/privacy/exports/{id}/download',
    summary: 'Download your data export',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const { url } = await getExportDownload(db, { userId: user.id, requestId: input.id });
    return new Response(null, {
      status: 302,
      headers: { location: url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });
  },
});
