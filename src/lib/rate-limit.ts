// Postgres fixed-window rate limiter over app.rate_limits (drizzle/0300_rate_limits.sql).
// Used by apiRoute's `rateLimit` option; call it directly for limits outside an API route.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from './db';

export type RateLimitResult = {
  /** False once this call pushed the window's count over `limit`. */
  allowed: boolean;
  /** Calls left in the current window after this one. */
  remaining: number;
  /** When the current window ends and the count starts again. */
  resetAt: Date;
};

const MAX_COUNT = 2_147_483_647;

/**
 * Counts one call against `key` in the current `windowSec`-second window and says whether it
 * is within `limit`. Windows are aligned to the Unix epoch, so every caller agrees on them.
 * Blocked calls still count. One atomic upsert, so concurrent callers never both slip under.
 */
export async function consume(
  db: DbOrTx,
  key: string,
  limit: number,
  windowSec: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  if (!Number.isInteger(windowSec) || windowSec <= 0) {
    throw new Error(`consume: windowSec must be a positive integer, got ${windowSec}`);
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`consume: limit must be a non-negative integer, got ${limit}`);
  }

  const windowMs = windowSec * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const resetAt = new Date(start.getTime() + windowMs);
  const startIso = start.toISOString();

  const rows = await queryRows<{ count: number | string }>(
    db,
    sql`
      insert into app.rate_limits as r (key, window_start, count)
      values (${key}, ${startIso}::timestamptz, 1)
      on conflict (key, window_start)
        do update set count = least(r.count + 1, ${MAX_COUNT})
      returning r.count
    `,
  );
  const count = Number(rows[0]?.count);
  if (!Number.isFinite(count)) throw new Error('consume: the upsert returned no count');

  if (count === 1) {
    // First call of a new window: the key's earlier windows can go.
    await db.execute(
      sql`delete from app.rate_limits where key = ${key} and window_start < ${startIso}::timestamptz`,
    );
  }

  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}
