// notify() and the in-app store: unread counts, read state, the list, preferences and email
// suppressions (spec section 9).
//
// notify() writes the in-app row and, for each channel the type uses, an outbox job (or a batch
// entry) in the same transaction as the caller, so a notification is never sent for a change
// that rolled back. Call kickWorker() after the caller's transaction commits to send at once;
// otherwise the scheduler picks the jobs up within a minute.
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { enqueue } from '@/modules/jobs';
import { emailSuppressions, notificationPreferences, notifications } from './schema';
import {
  CATEGORIES,
  CHANNELS,
  isMandatory,
  notificationUrl,
  requireType,
  type Category,
  type Channel,
  type NotificationData,
} from './types';

export const EMAIL_TOPIC = 'notifications.email';
export const PUSH_TOPIC = 'notifications.push';

const MAX_TITLE = 200;
const MAX_BODY = 2000;

function clip(value: string, max: number): string {
  const s = value.trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** The outbox dedupe key of a notification's job on one channel. */
export function jobKey(notificationId: string, channel: Channel): string {
  return `notif:${notificationId}:${channel}`;
}

type Recipient = {
  email: string | null;
  deleted: boolean;
  suppressed: boolean;
  hasPush: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
};

/**
 * Everything notify() needs to pick channels, in one round trip. The address comes from
 * app.users (read-only; identity owns the table and exposes no lookup by id).
 */
async function loadRecipient(
  db: DbOrTx,
  userId: string,
  category: Category,
): Promise<Recipient | null> {
  const [row] = await queryRows<{
    email: string | null;
    deleted: boolean;
    suppressed: boolean;
    has_push: boolean;
    email_enabled: boolean;
    push_enabled: boolean;
  }>(
    db,
    sql`
      select
        u.email,
        u.deleted_at is not null as deleted,
        exists (
          select 1 from app.email_suppressions s where s.email = lower(u.email)
        ) as suppressed,
        exists (select 1 from app.push_subscriptions p where p.user_id = u.id) as has_push,
        coalesce((
          select enabled from app.notification_preferences
          where user_id = u.id and category = ${category} and channel = 'email'
        ), true) as email_enabled,
        coalesce((
          select enabled from app.notification_preferences
          where user_id = u.id and category = ${category} and channel = 'push'
        ), true) as push_enabled
      from app.users u
      where u.id = ${userId}
    `,
  );
  if (!row) return null;
  return {
    email: row.email,
    deleted: row.deleted,
    suppressed: row.suppressed,
    hasPush: row.has_push,
    emailEnabled: row.email_enabled,
    pushEnabled: row.push_enabled,
  };
}

/**
 * Adds a notification to the user's open batch for `batchKey`, creating it (due at
 * `sendAfter`) if there is none. Later notifications join the batch without moving its time.
 */
async function appendToBatch(
  db: DbOrTx,
  b: {
    userId: string;
    batchKey: string;
    channel: Channel;
    notificationId: string;
    sendAfter: Date;
  },
): Promise<void> {
  await db.execute(sql`
    insert into app.notification_batches
      (id, user_id, batch_key, channel, notification_ids, send_after)
    values (
      ${newId()}, ${b.userId}, ${b.batchKey}, ${b.channel},
      array[${b.notificationId}::uuid], ${b.sendAfter.toISOString()}::timestamptz
    )
    on conflict (user_id, batch_key, channel) where status = 'pending'
    do update set notification_ids =
      app.notification_batches.notification_ids || excluded.notification_ids
  `);
}

/**
 * Notifies a user: writes the in-app row, then for each channel the type uses (email, push)
 * enqueues a job (dedupe key `notif:<id>:<channel>`) or, for a batched email, appends to the
 * user's batch. A channel is used when the type is mandatory or the user's preference for the
 * category is on (the default), and:
 * - email: the user has an address that isn't suppressed;
 * - push: the user has at least one push subscription.
 * Deleted users get the in-app row only. Throws for an unknown type.
 */
export async function notify(
  db: DbOrTx,
  userId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const def = requireType(type);
  const now = new Date();
  const id = newId();
  const title = clip(def.title(data), MAX_TITLE);
  const body = clip(def.body(data), MAX_BODY);

  // A savepoint inside the caller's transaction, or a transaction of its own.
  await db.transaction(async (tx) => {
    await tx.insert(notifications).values({
      id,
      userId,
      type,
      category: def.category,
      title,
      body,
      data: sql`${JSON.stringify(data ?? {})}::jsonb`,
      createdAt: now,
      updatedAt: now,
    });

    if (!def.email && !def.push) return;
    const r = await loadRecipient(tx, userId, def.category);
    if (!r || r.deleted) return;
    const mandatory = isMandatory(def);

    if (def.email && r.email && !r.suppressed && (mandatory || r.emailEnabled)) {
      const batch = def.email.batch;
      if (batch) {
        await appendToBatch(tx, {
          userId,
          batchKey: batch.key,
          channel: 'email',
          notificationId: id,
          sendAfter: new Date(now.getTime() + batch.delayMinutes * 60_000),
        });
      } else {
        await enqueue(tx, {
          topic: EMAIL_TOPIC,
          payload: { notificationId: id },
          dedupeKey: jobKey(id, 'email'),
        });
      }
    }

    if (def.push && r.hasPush && (mandatory || r.pushEnabled)) {
      await enqueue(tx, {
        topic: PUSH_TOPIC,
        payload: { notificationId: id },
        dedupeKey: jobKey(id, 'push'),
      });
    }
  });
}

// --- Read state ------------------------------------------------------------------------------

export async function unreadCount(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from app.notifications
        where user_id = ${userId} and read_at is null`,
  );
  return row?.n ?? 0;
}

/** Marks the user's own notifications read: the given ids, or every unread one. */
export async function markRead(db: DbOrTx, userId: string, ids: string[] | 'all'): Promise<void> {
  if (ids !== 'all' && ids.length === 0) return;
  const mine = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(ids === 'all' ? mine : and(mine, inArray(notifications.id, ids)));
}

export type NotificationItem = {
  id: string;
  type: string;
  category: Category;
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Where the notification leads (absolute), or null. */
  url: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/** The user's notifications, newest first. Pass `nextBefore` back as `before` for the next page. */
export async function listNotifications(
  db: DbOrTx,
  userId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<{ items: NotificationItem[]; nextBefore: string | null }> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 20), 1), 100);
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      category: notifications.category,
      title: notifications.title,
      body: notifications.body,
      data: notifications.data,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      opts.before
        ? and(eq(notifications.userId, userId), lt(notifications.id, opts.before))
        : eq(notifications.userId, userId),
    )
    .orderBy(desc(notifications.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const items = page.map((r) => {
    const data = (r.data ?? {}) as NotificationData;
    return { ...r, data, url: notificationUrl(r.type, data) };
  });
  const last = page[page.length - 1];
  return { items, nextBefore: rows.length > limit && last ? last.id : null };
}

// --- Preferences -----------------------------------------------------------------------------

export type Preferences = Record<Category, Record<Channel, boolean>>;

/** Every category's email and push switches; anything never set is on. */
export async function getPreferences(db: DbOrTx, userId: string): Promise<Preferences> {
  const out = Object.fromEntries(
    CATEGORIES.map((c) => [c, Object.fromEntries(CHANNELS.map((ch) => [ch, true]))]),
  ) as Preferences;
  const rows = await db
    .select({
      category: notificationPreferences.category,
      channel: notificationPreferences.channel,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  for (const r of rows) out[r.category][r.channel] = r.enabled;
  return out;
}

/**
 * Turns one category's channel on or off for a user. Mandatory types (security, billing,
 * operator alerts) are sent whatever this says.
 */
export async function setPreference(
  db: DbOrTx,
  userId: string,
  category: Category,
  channel: Channel,
  enabled: boolean,
): Promise<void> {
  await db
    .insert(notificationPreferences)
    .values({ userId, category, channel, enabled })
    .onConflictDoUpdate({
      target: [
        notificationPreferences.userId,
        notificationPreferences.category,
        notificationPreferences.channel,
      ],
      set: { enabled },
    });
}

// --- Email suppressions ----------------------------------------------------------------------

export type SuppressionReason = 'bounce' | 'complaint' | 'manual';

/** Stops all email to an address (compared case-insensitively). */
export async function suppressEmail(
  db: DbOrTx,
  email: string,
  reason: SuppressionReason,
): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!address) return;
  await db
    .insert(emailSuppressions)
    .values({ email: address, reason })
    .onConflictDoUpdate({ target: emailSuppressions.email, set: { reason } });
}

export async function isEmailSuppressed(db: DbOrTx, email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (!address) return false;
  const rows = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, address))
    .limit(1);
  return rows.length > 0;
}
