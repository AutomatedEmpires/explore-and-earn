// GET /api/v1/notifications?before=<id>&limit=<n>: the signed-in user's notifications, newest
// first, with the unread count. Pass `nextBefore` back as `before` for the next page.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { CATEGORIES, listNotifications, unreadCount } from '@/modules/notifications';
import { apiRoute } from '@/server/api';

const input = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const item = z.object({
  id: z.uuid(),
  type: z.string(),
  category: z.enum(CATEGORIES),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()),
  url: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

const output = z.object({
  items: z.array(item),
  nextBefore: z.uuid().nullable(),
  unread: z.number().int(),
});

export const GET = apiRoute({
  auth: 'user',
  input,
  openapi: {
    method: 'GET',
    path: '/api/v1/notifications',
    summary: "The signed-in user's notifications, newest first",
    output,
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const [page, unread] = await Promise.all([
      listNotifications(db, user.id, { before: input.before, limit: input.limit }),
      unreadCount(db, user.id),
    ]);
    return {
      items: page.items.map((n) => ({
        ...n,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
      nextBefore: page.nextBefore,
      unread,
    };
  },
});
