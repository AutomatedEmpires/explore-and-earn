// Per-operator stats for the console's Operators page (spec section 12).
//
// - handled: review items the operator decided (`decided_by`) and that were resolved since
//   `since`;
// - avgHandleMinutes: the average of `resolved_at - assigned_at` over those items, or null when
//   there are none;
// - overturnedOnAppeal: how many of those decisions were a removal, suspension or ban that an
//   appeal later reversed (an appeal resolved with `approve`).
//
// Review items are the trust module's table (drizzle/0400_trust.sql); these are read-only
// aggregates over it, so they use raw SQL rather than a deep import of trust's schema.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';

export type OperatorStats = {
  handled: number;
  avgHandleMinutes: number | null;
  overturnedOnAppeal: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Decisions an appeal can overturn by approving the subject after all. */
const OVERTURNABLE = sql`('remove', 'suspend', 'ban')`;

export async function operatorStats(
  db: DbOrTx,
  operatorId: string,
  since: Date,
): Promise<OperatorStats> {
  if (!UUID.test(operatorId)) return { handled: 0, avgHandleMinutes: null, overturnedOnAppeal: 0 };

  const [row] = await queryRows<{
    handled: number;
    avg_minutes: number | string | null;
    overturned: number;
  }>(
    db,
    sql`
      with decided as (
        select r.id, r.resolution, r.assigned_at, r.resolved_at
        from app.review_items r
        where r.decided_by = ${operatorId}::uuid
          and r.status = 'resolved'
          and r.resolved_at >= ${since}::timestamptz
      )
      select
        (select count(*)::int from decided) as handled,
        (
          select (avg(extract(epoch from (d.resolved_at - d.assigned_at))) / 60)::float8
          from decided d
          where d.assigned_at is not null
        ) as avg_minutes,
        (
          select count(distinct d.id)::int
          from decided d
          join app.review_items appeal
            on appeal.original_item_id = d.id
           and appeal.queue = 'appeals'
           and appeal.status = 'resolved'
           and appeal.resolution = 'approve'
          where d.resolution in ${OVERTURNABLE}
        ) as overturned
    `,
  );

  const avg = row?.avg_minutes;
  return {
    handled: row?.handled ?? 0,
    avgHandleMinutes: avg === null || avg === undefined ? null : Number(avg),
    overturnedOnAppeal: row?.overturned ?? 0,
  };
}
