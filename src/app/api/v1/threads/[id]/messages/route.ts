// POST /api/v1/threads/{id}/messages.
import { unauthorized } from '@/lib/errors';
import { idParamSchema, sendMessageSchema } from '@/lib/messaging';
import { sendMessage } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import { threadViewer } from '@/server/thread-viewer';

export const POST = apiRoute({
  auth: 'user',
  input: sendMessageSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `messages:${ctx.user?.id}`, limit: 60, windowSec: 600 },
  openapi: { method: 'POST', path: '/api/v1/threads/{id}/messages', summary: 'Send a message' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return sendMessage(db, await threadViewer(user), input.id, input);
  },
});
