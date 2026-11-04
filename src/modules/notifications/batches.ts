// The `notifications.flush_batches` job (every minute). Each email batch that is due is closed
// (status 'sent') and, if any of its notifications are still unread, handed to the email
// channel as one `notifications.email` job with `{ batchId }`, in the same transaction. The
// digest itself is rendered and sent by that job, so it gets the outbox's retries.
// A notification that arrives after its batch closed starts a new batch.
import { sql } from 'drizzle-orm';
import { queryRows, withTx, type Db } from '@/lib/db';
import { enqueue } from '@/modules/jobs';
import { EMAIL_TOPIC } from './notify';

export const FLUSH_TOPIC = 'notifications.flush_batches';

const DEFAULT_LIMIT = 500;

/** Closes the email batches due at `now`. Returns how many digests were queued or skipped. */
export async function flushBatches(
  db: Db,
  now: Date,
  limit = DEFAULT_LIMIT,
): Promise<{ queued: number; skipped: number }> {
  return withTx(db, async (tx) => {
    // `skip locked`: a second flush running at the same time takes other batches.
    const due = await queryRows<{ id: string; unread: number }>(
      tx,
      sql`
        with due as (
          update app.notification_batches b
          set status = 'sent'
          where b.id in (
            select id from app.notification_batches
            where status = 'pending'
              and channel = 'email'
              and send_after <= ${now.toISOString()}::timestamptz
            order by send_after
            limit ${limit}::int
            for update skip locked
          )
          returning b.id, b.user_id, b.notification_ids
        )
        select d.id, (
          select count(*)::int from app.notifications n
          where n.id = any (d.notification_ids)
            and n.user_id = d.user_id
            and n.read_at is null
        ) as unread
        from due d
      `,
    );

    let queued = 0;
    for (const batch of due) {
      if (batch.unread === 0) continue;
      await enqueue(tx, {
        topic: EMAIL_TOPIC,
        payload: { batchId: batch.id },
        dedupeKey: `batch:${batch.id}:email`,
      });
      queued++;
    }
    return { queued, skipped: due.length - queued };
  });
}
