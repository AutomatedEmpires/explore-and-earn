// Retention for webhook delivery records (SP8 spec 8.3). The row only proves an event ID was
// seen; providers stop retrying a delivery long before 30 days, so nothing replays after that.
import { sql } from 'drizzle-orm';
import { queryRows } from '@/lib/db';
import type { RetentionRule } from '@/modules/privacy';

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 30;

export const retentionRules: RetentionRule[] = [
  {
    key: 'identity.webhook_events_30d',
    description:
      'Records of messages from our sign-in and payment providers are deleted after 30 days.',
    async run(db, now, limit) {
      const cutoff = new Date(now.getTime() - KEEP_DAYS * DAY_MS).toISOString();
      const rows = await queryRows(
        db,
        sql`
          delete from app.webhook_events
          where id in (
            select id from app.webhook_events
            where received_at < ${cutoff}::timestamptz
            order by received_at
            limit ${limit}
          )
          returning id
        `,
      );
      return { deleted: rows.length };
    },
  },
];
