// POST /api/v1/media/uploads: ask for a signed URL to upload one file into quarantine.
// Body { kind, mime, sizeBytes }. The file is unreadable until it has been scanned.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { getStorage, requestUpload, uploadRequestSchema } from '@/modules/media';
import { apiRoute } from '@/server/api';
import { requireHost } from '@/server/guards';

const output = z.object({ mediaId: z.uuid(), uploadUrl: z.string(), token: z.string() });

export const POST = apiRoute({
  auth: 'user',
  input: uploadRequestSchema,
  rateLimit: { key: (ctx) => `uploads:${ctx.user?.id}`, limit: 60, windowSec: 3600 },
  openapi: {
    method: 'POST',
    path: '/api/v1/media/uploads',
    summary: 'Request a signed upload URL for a file (it is scanned before anyone can read it)',
    output,
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    // A host's uploads also belong to their active organization, so its members can read them.
    const orgId = user.accountType === 'host' ? (await requireHost()).orgId : undefined;
    return requestUpload(db, getStorage(), { userId: user.id, orgId }, input);
  },
});
