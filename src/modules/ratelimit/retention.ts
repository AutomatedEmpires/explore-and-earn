// Old rate-limit windows. `consume()` already deletes a key's earlier windows when the key comes
// back; this removes the windows of keys that never do (the privacy module's retention sweep
// calls it for `privacy.rate_limit_windows_2d`).
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';

/**
 * Deletes up to `limit` windows that started before `before` (exclusive: a window that started
 * exactly at `before` is kept) and returns how many it deleted.
 */
export async function purgeRateLimitWindows(
  db: DbOrTx,
  before: Date,
  limit: number,
): Promise<number> {
  const rows = await queryRows(
    db,
    sql`
      delete from app.rate_limits
      where (key, window_start) in (
        select key, window_start from app.rate_limits
        where window_start < ${before.toISOString()}::timestamptz
        order by window_start
        limit ${limit}
      )
      returning key
    `,
  );
  return rows.length;
}
