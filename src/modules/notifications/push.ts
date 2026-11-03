// The web push channel (VAPID, the `web-push` library): browser subscriptions and the
// `notifications.push` job, which sends a notification to every browser the user subscribed.
//
// A subscription the push service reports gone (404 or 410) is deleted. Any other failure is
// logged; the job throws (so the outbox retries) only when no browser got the message, because
// a retry resends to every subscription.
import { and, eq, sql } from 'drizzle-orm';
import webpush from 'web-push';
import { z } from 'zod';
import { queryRows, type DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { pushSubscriptions } from './schema';
import { getType, isMandatory, notificationUrl, type NotificationData } from './types';

export const PUSH_TTL_SECONDS = 24 * 60 * 60;
const MAX_PUSH_BODY = 500;

/**
 * Push services browsers use. We POST to whatever endpoint a browser registers, so anything
 * else is refused: otherwise a signed-in user could make the server send requests to any host.
 */
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge on Android, Opera, Brave, Samsung Internet
  'android.googleapis.com', // legacy Chrome endpoints
  'push.services.mozilla.com', // Firefox (updates.push.services.mozilla.com)
  'notify.windows.com', // Edge on Windows (*.notify.windows.com)
  'push.apple.com', // Safari (web.push.apple.com)
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const base64url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/, 'must be base64url');

/** A browser's `PushSubscription.toJSON()`. */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine(isAllowedPushEndpoint, 'must be an https endpoint on a known push service'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: base64url.min(16).max(256),
    auth: base64url.min(8).max(64),
  }),
});

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Saves a browser's subscription. An endpoint belongs to one browser, so it moves to the
 * user who registered it last (for example after switching accounts on a shared device). */
export async function upsertSubscription(
  db: DbOrTx,
  userId: string,
  s: PushSubscriptionInput,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      id: newId(),
      userId,
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: sql`excluded.user_id`,
        p256dh: sql`excluded.p256dh`,
        auth: sql`excluded.auth`,
      },
    });
}

/** Deletes the user's own subscription for `endpoint`. Returns whether one was deleted. */
export async function removeSubscription(
  db: DbOrTx,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const removed = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    .returning({ id: pushSubscriptions.id });
  return removed.length > 0;
}

/** The key browsers need for `pushManager.subscribe({ applicationServerKey })`. */
export function vapidPublicKey(): string {
  return getEnv().VAPID_PUBLIC_KEY;
}

// --- The job ---------------------------------------------------------------------------------

const payloadSchema = z.object({ notificationId: z.uuid() });

/** What the service worker (public/sw.js) receives. */
export type PushMessage = {
  title: string;
  body: string;
  data: { url: string | null; notificationId: string; type: string };
};

function statusOf(err: unknown): number | null {
  if (typeof err !== 'object' || err === null || !('statusCode' in err)) return null;
  return typeof err.statusCode === 'number' ? err.statusCode : null;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export type PushResult = { sent: number; removed: number; failed: number };

/**
 * Handles a `notifications.push` job (`{ notificationId }`). Re-checks the user and their push
 * preference, then sends to each subscription. Throws on an unreadable payload, and when every
 * send failed with something other than 404/410.
 */
export async function sendPushJob(
  db: DbOrTx,
  payload: unknown,
  deps: { now?: Date } = {},
): Promise<PushResult> {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error('notifications.push: invalid payload');
  const { notificationId } = parsed.data;
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };

  const [n] = await queryRows<{
    user_id: string;
    type: string;
    title: string;
    body: string;
    data: string;
    deleted: boolean;
    push_enabled: boolean;
  }>(
    db,
    sql`
      select n.user_id, n.type, n.title, n.body, n.data::text as data,
        u.deleted_at is not null as deleted,
        coalesce((
          select enabled from app.notification_preferences p
          where p.user_id = n.user_id and p.category = n.category and p.channel = 'push'
        ), true) as push_enabled
      from app.notifications n
      join app.users u on u.id = n.user_id
      where n.id = ${notificationId}
    `,
  );
  if (!n) {
    logger.warn('notifications.push: notification not found', { notificationId });
    return result;
  }
  const def = getType(n.type);
  if (!def?.push || n.deleted || !(isMandatory(def) || n.push_enabled)) return result;

  const subs = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, n.user_id))
    .orderBy(pushSubscriptions.id);
  if (subs.length === 0) return result;

  const message: PushMessage = {
    title: n.title,
    body: clip(n.body, MAX_PUSH_BODY),
    data: {
      url: notificationUrl(n.type, JSON.parse(n.data) as NotificationData),
      notificationId,
      type: n.type,
    },
  };
  const env = getEnv();
  const options = {
    vapidDetails: {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
    TTL: PUSH_TTL_SECONDS,
    urgency: isMandatory(def) ? ('high' as const) : ('normal' as const),
  };
  const body = JSON.stringify(message);
  const now = deps.now ?? new Date();

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        options,
      );
      await db
        .update(pushSubscriptions)
        .set({ lastSuccessAt: now })
        .where(eq(pushSubscriptions.id, sub.id));
      result.sent++;
    } catch (err) {
      const status = statusOf(err);
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        result.removed++;
      } else {
        // The endpoint is a capability URL; log only its host.
        logger.warn('notifications.push: send failed', {
          notificationId,
          subscriptionId: sub.id,
          host: new URL(sub.endpoint).host,
          status,
          err: err instanceof Error ? err.message : String(err),
        });
        result.failed++;
      }
    }
  }

  if (result.sent === 0 && result.failed > 0) {
    throw new Error(`notifications.push: every push failed (${result.failed})`);
  }
  return result;
}
