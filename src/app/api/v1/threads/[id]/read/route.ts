// POST /api/v1/threads/{id}/read.
import { unauthorized } from '@/lib/errors';
import { idParamSchema } from '@/lib/messaging';
import { markThreadRead } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import { threadViewer } from '@/server/thread-viewer';

export const POST = apiRoute({
  auth: 'user',
  input: idParamSchema,
  openapi: { method: 'POST', path: '/api/v1/threads/{id}/read', summary: 'Mark a thread read' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await markThreadRead(db, await threadViewer(user), input.id);
  },
});
