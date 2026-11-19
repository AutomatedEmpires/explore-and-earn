// GET /api/v1/threads/{id}. Cards are hydrated here so messaging never imports hiring.
import { unauthorized } from '@/lib/errors';
import { idParamSchema, threadQuerySchema } from '@/lib/messaging';
import { getCardPayloads } from '@/modules/hiring';
import { getThread } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import { threadViewer } from '@/server/thread-viewer';

export const GET = apiRoute({
  auth: 'user',
  input: threadQuerySchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'GET', path: '/api/v1/threads/{id}', summary: 'Read a thread' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const viewer = await threadViewer(user);
    const view = await getThread(db, viewer, input.id, { before: input.before });
    const cards = view.messages.flatMap((message) => (message.card ? [message.card] : []));
    return { ...view, cards: await getCardPayloads(db, { viewer, cards }) };
  },
});
