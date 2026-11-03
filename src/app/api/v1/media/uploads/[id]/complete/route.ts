// POST /api/v1/media/uploads/{id}/complete: the uploader says the file is in place, which
// queues its scan. Calling it again is harmless. Returns 204.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import { completeUpload } from '@/modules/media';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'user',
  input: z.object({ id: z.uuid() }),
  // Its own bucket, so completing uploads never uses up the 60 upload requests an hour.
  rateLimit: { key: (ctx) => `uploads:complete:${ctx.user?.id}`, limit: 60, windowSec: 3600 },
  openapi: {
    method: 'POST',
    path: '/api/v1/media/uploads/{id}/complete',
    summary: 'Mark an upload finished and queue its scan',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await completeUpload(db, { userId: user.id }, input.id);
    kickWorker();
  },
});
