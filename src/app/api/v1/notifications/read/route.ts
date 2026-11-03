// POST /api/v1/notifications/read: marks the signed-in user's notifications read.
// Body: { "ids": ["<id>", ...] } or { "ids": "all" }. Returns the new unread count.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { markRead, unreadCount } from '@/modules/notifications';
import { apiRoute } from '@/server/api';

const input = z.object({
  ids: z.union([z.literal('all'), z.array(z.uuid()).min(1).max(200)]),
});

const output = z.object({ unread: z.number().int() });

export const POST = apiRoute({
  auth: 'user',
  input,
  openapi: {
    method: 'POST',
    path: '/api/v1/notifications/read',
    summary: 'Mark notifications read (some ids, or "all")',
    output,
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await markRead(db, user.id, input.ids);
    return { unread: await unreadCount(db, user.id) };
  },
});
