// Retention for the outbox (SP8 spec 8.3): finished jobs go after 30 days, dead ones after 90.
// A dead job is kept longer because an operator may still need its error to retry the work.
import { sql } from 'drizzle-orm';
import { queryRows, type Db } from '@/lib/db';
import type { RetentionRule } from '@/modules/privacy';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes up to `limit` outbox rows in `status` last updated before `now - days` (exclusive). */
async function deleteSettled(
  db: Db,
  status: 'done' | 'dead',
  days: number,
  now: Date,
  limit: number,
): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString();
  const rows = await queryRows(
    db,
    sql`
      delete from app.outbox
      where id in (
        select id from app.outbox
        where status = ${status} and updated_at < ${cutoff}::timestamptz
        order by updated_at
        limit ${limit}
      )
      returning id
    `,
  );
  return { deleted: rows.length };
}

export const retentionRules: RetentionRule[] = [
  {
    key: 'jobs.outbox_done_30d',
    description: 'Records of finished background jobs are deleted after 30 days.',
    run: (db, now, limit) => deleteSettled(db, 'done', 30, now, limit),
  },
  {
    key: 'jobs.outbox_dead_90d',
    description: 'Records of failed background jobs are deleted after 90 days.',
    run: (db, now, limit) => deleteSettled(db, 'dead', 90, now, limit),
  },
];
