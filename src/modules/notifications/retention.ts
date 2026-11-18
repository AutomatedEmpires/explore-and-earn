// Retention for the in-app inbox (SP8 spec 8.3): notifications, and the batches that already
// sent them, go after 90 days. A pending batch is never deleted: it still has mail to send.
import { sql } from 'drizzle-orm';
import { queryRows } from '@/lib/db';
import type { RetentionRule } from '@/modules/privacy';

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 90;

export const retentionRules: RetentionRule[] = [
  {
    key: 'notifications.in_app_90d',
    description: 'In-app notifications are deleted after 90 days.',
    async run(db, now, limit) {
      const cutoff = new Date(now.getTime() - KEEP_DAYS * DAY_MS).toISOString();
      const notifications = await queryRows(
        db,
        sql`
          delete from app.notifications
          where id in (
            select id from app.notifications
            where created_at < ${cutoff}::timestamptz
            order by created_at
            limit ${limit}
          )
          returning id
        `,
      );
      // One limit covers both tables, so a run never deletes more than it was asked to.
      const left = limit - notifications.length;
      if (left <= 0) return { deleted: notifications.length };
      const batches = await queryRows(
        db,
        sql`
          delete from app.notification_batches
          where id in (
            select id from app.notification_batches
            where status = 'sent' and created_at < ${cutoff}::timestamptz
            order by created_at
            limit ${left}
          )
          returning id
        `,
      );
      return { deleted: notifications.length + batches.length };
    },
  },
];
