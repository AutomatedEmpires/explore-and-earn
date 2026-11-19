// GET/POST /api/v1/host/saved-replies.
import { unauthorized } from '@/lib/errors';
import { savedReplySchema } from '@/lib/messaging';
import { createSavedReply, listSavedReplies } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  openapi: { method: 'GET', path: '/api/v1/host/saved-replies', summary: 'List saved replies' },
  handler: async ({ db, host }) => {
    if (!host) throw unauthorized();
    return { replies: await listSavedReplies(db, host) };
  },
});

export const POST = apiRoute({
  auth: 'host',
  input: savedReplySchema,
  openapi: { method: 'POST', path: '/api/v1/host/saved-replies', summary: 'Create a saved reply' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    return createSavedReply(db, host, input);
  },
});
