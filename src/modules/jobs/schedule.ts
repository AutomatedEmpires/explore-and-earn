import { CronExpressionParser } from 'cron-parser';
import { sql } from 'drizzle-orm';
import { queryRows, withTx, type Db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { schedules as registeredSchedules } from '@/server/schedules';
import { enqueue } from './outbox';

export type Schedule = { topic: string; cron: string };

/** The latest time at or before `now` that `cron` (evaluated in UTC) fires. Throws if invalid. */
export function lastDueAt(cron: string, now: Date): Date {
  // prev() is strictly before currentDate, so step 1 ms past `now` to include `now` itself.
  const expression = CronExpressionParser.parse(cron, {
    currentDate: new Date(now.getTime() + 1),
    tz: 'UTC',
  });
  return expression.prev().toDate();
}

/**
 * Enqueues every scheduled topic whose cron time has come since it was last enqueued, and
 * returns those topics. Each topic is enqueued at most once per cron time, however often this
 * runs and however many copies run at once: a conditional upsert of `app.schedule_runs` lets
 * exactly one caller advance the topic, in the same transaction as its outbox event (whose
 * dedupe key is the topic and cron time). After downtime only the latest missed run is enqueued.
 */
export async function enqueueDueSchedules(
  db: Db,
  now: Date,
  list: Schedule[] = registeredSchedules,
): Promise<string[]> {
  const enqueued: string[] = [];

  for (const { topic, cron } of list) {
    let dueAt: Date;
    try {
      dueAt = lastDueAt(cron, now);
    } catch (err) {
      logger.error('schedule skipped: invalid cron expression', { topic, cron, error: err });
      continue;
    }

    const advanced = await withTx(db, async (tx) => {
      const rows = await queryRows<{ topic: string }>(
        tx,
        sql`
          insert into app.schedule_runs (topic, last_run_at)
          values (${topic}, ${dueAt}::timestamptz)
          on conflict (topic) do update set last_run_at = excluded.last_run_at
          where app.schedule_runs.last_run_at < excluded.last_run_at
          returning topic
        `,
      );
      if (rows.length === 0) return false;

      const scheduledFor = dueAt.toISOString();
      await enqueue(tx, {
        topic,
        payload: { scheduledFor },
        dedupeKey: `schedule:${topic}:${scheduledFor}`,
        availableAt: now,
      });
      return true;
    });

    if (advanced) enqueued.push(topic);
  }

  return enqueued;
}
