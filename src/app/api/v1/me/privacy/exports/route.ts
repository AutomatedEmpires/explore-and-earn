// POST /api/v1/me/privacy/exports: start a download of everything we hold about the caller,
// after reverifying. 409 `export_open` while one is being prepared; 429 after 3 in 30 days.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import { requestExport } from '@/modules/privacy';
import { apiRoute } from '@/server/api';
import { requireRecentAuth } from '@/server/guards';

export const POST = apiRoute({
  auth: 'user',
  openapi: {
    method: 'POST',
    path: '/api/v1/me/privacy/exports',
    summary: 'Request a download of your data',
    output: z.object({ requestId: z.uuid(), status: z.literal('running') }),
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    await requireRecentAuth();
    const { requestId } = await requestExport(db, user.id);
    kickWorker();
    return { requestId, status: 'running' as const };
  },
});
