// Notifications' privacy handler. Everything addressed to the person is deleted. The one row
// kept is the suppression of their email address: it is what stops us from mailing an address
// that bounced or complained, which the law requires us to honor.
import { asc, desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getUserContact } from '@/modules/identity';
import type { EraseResult, PrivacyHandler } from '@/modules/privacy';
import {
  emailSuppressions,
  notificationBatches,
  notificationPreferences,
  notifications,
  pushSubscriptions,
} from './schema';

async function suppressionRetained(db: DbOrTx, userId: string): Promise<EraseResult['retained']> {
  const email = (await getUserContact(db, userId))?.email?.trim().toLowerCase();
  if (!email) return [];
  const [row] = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, email));
  return row ? [{ table: 'email_suppressions', reason: 'legal_obligation', until: null }] : [];
}

export const privacyHandler: PrivacyHandler = {
  module: 'notifications',
  tables: [
    'notifications',
    'notification_preferences',
    'push_subscriptions',
    'email_suppressions',
    'notification_batches',
  ],

  async exportData(db, s) {
    if (s.kind !== 'user') return { records: { preferences: [], notifications: [] }, files: [] };
    const preferences = await db
      .select({
        category: notificationPreferences.category,
        channel: notificationPreferences.channel,
        enabled: notificationPreferences.enabled,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, s.userId))
      .orderBy(asc(notificationPreferences.category), asc(notificationPreferences.channel));
    const rows = await db
      .select({
        title: notifications.title,
        body: notifications.body,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, s.userId))
      .orderBy(desc(notifications.id));
    return { records: { preferences, notifications: rows }, files: [] };
  },

  async erase(tx, s, ctx) {
    if (s.kind !== 'user') return { erased: 0, retained: [] };
    const suppression = await suppressionRetained(tx, s.userId);

    if (ctx.holds.includes('all')) {
      const held: EraseResult['retained'] = [];
      const has = async (table: string, rows: Promise<unknown[]>) => {
        if ((await rows).length > 0) held.push({ table, reason: 'legal_hold', until: null });
      };
      await has(
        'notifications',
        tx
          .select({ id: notifications.id })
          .from(notifications)
          .where(eq(notifications.userId, s.userId))
          .limit(1),
      );
      await has(
        'notification_preferences',
        tx
          .select({ userId: notificationPreferences.userId })
          .from(notificationPreferences)
          .where(eq(notificationPreferences.userId, s.userId))
          .limit(1),
      );
      await has(
        'push_subscriptions',
        tx
          .select({ id: pushSubscriptions.id })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, s.userId))
          .limit(1),
      );
      await has(
        'notification_batches',
        tx
          .select({ id: notificationBatches.id })
          .from(notificationBatches)
          .where(eq(notificationBatches.userId, s.userId))
          .limit(1),
      );
      return { erased: 0, retained: [...held, ...suppression] };
    }

    const batches = await tx
      .delete(notificationBatches)
      .where(eq(notificationBatches.userId, s.userId))
      .returning({ id: notificationBatches.id });
    const pushes = await tx
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, s.userId))
      .returning({ id: pushSubscriptions.id });
    const preferences = await tx
      .delete(notificationPreferences)
      .where(eq(notificationPreferences.userId, s.userId))
      .returning({ userId: notificationPreferences.userId });
    const rows = await tx
      .delete(notifications)
      .where(eq(notifications.userId, s.userId))
      .returning({ id: notifications.id });
    return {
      erased: batches.length + pushes.length + preferences.length + rows.length,
      retained: suppression,
    };
  },
};
