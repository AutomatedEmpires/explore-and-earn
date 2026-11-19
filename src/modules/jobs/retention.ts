// Retention for the outbox (SP8 spec 8.3): finished jobs go after 30 days, dead ones after 90.
// A dead job is kept longer because an operator may still need its error to retry the work.
// A settled job whose payload names a person or organization under a legal hold on everything
// is kept, as the jobs eraser keeps it (lead decision 2026-11-18).
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
  // Loaded on first use: the privacy barrel loads this module's barrel.
  const { namesUnderLegalHold } = await import('@/modules/privacy');
  const rows = await queryRows(
    db,
    sql`
      delete from app.outbox
      where id in (
        select o.id from app.outbox o
        where o.status = ${status} and o.updated_at < ${cutoff}::timestamptz
          and not ${namesUnderLegalHold(sql`o.payload::text`, 'all')}
        order by o.updated_at
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
