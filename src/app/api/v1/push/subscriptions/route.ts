// /api/v1/push/subscriptions: the signed-in user's web push subscriptions.
// - GET: { publicKey }, the VAPID key for `pushManager.subscribe({ applicationServerKey })`.
// - POST: a browser's `PushSubscription.toJSON()` ({ endpoint, keys: { p256dh, auth } }),
//   upserted by endpoint.
// - DELETE: { endpoint }, removes the caller's own subscription.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import {
  pushSubscriptionSchema,
  removeSubscription,
  upsertSubscription,
  vapidPublicKey,
} from '@/modules/notifications';
import { apiRoute, type ApiContext } from '@/server/api';

const PATH = '/api/v1/push/subscriptions';

const rateLimit = {
  key: (ctx: ApiContext<unknown>) => `push-subscriptions:${ctx.user?.id}`,
  limit: 30,
  windowSec: 3600,
};

export const GET = apiRoute({
  auth: 'user',
  openapi: {
    method: 'GET',
    path: PATH,
    summary: 'The VAPID public key for subscribing to web push',
    output: z.object({ publicKey: z.string() }),
  },
  handler: async () => ({ publicKey: vapidPublicKey() }),
});

export const POST = apiRoute({
  auth: 'user',
  input: pushSubscriptionSchema,
  rateLimit,
  openapi: { method: 'POST', path: PATH, summary: "Save this browser's push subscription" },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await upsertSubscription(db, user.id, input);
  },
});

export const DELETE = apiRoute({
  auth: 'user',
  input: z.object({ endpoint: z.string().min(1).max(2048) }),
  rateLimit,
  openapi: { method: 'DELETE', path: PATH, summary: "Remove this browser's push subscription" },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await removeSubscription(db, user.id, input.endpoint);
  },
});
