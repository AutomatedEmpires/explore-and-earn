// Postgres fixed-window rate limiter over app.rate_limits (drizzle/0300_rate_limits.sql), the
// ratelimit module's one table.
// Used by apiRoute's `rateLimit` option; call it directly for limits outside an API route.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { isPerfMode } from '@/lib/perf-mode';

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
  // The performance seeder must not write a row per request.
  if (isPerfMode(getEnv())) {
    return { allowed: true, remaining: limit, resetAt: now };
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

/** How long a new host stays under the daily invite and profile-view caps. */
export const NEW_HOST_DAYS = 30;

const DAY_SEC = 86_400;
const DAY_MS = DAY_SEC * 1000;

/** Daily caps for a host's first 30 days. Each action has its own counter. */
export const NEW_HOST_DAILY_CAP = { invites: 10, profile_views: 25 } as const;

export type NewHostAction = keyof typeof NEW_HOST_DAILY_CAP;

/** True while `now` is still inside the host's first 30 days. The 30th day itself is past the cap. */
export function newHostWindowOpen(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < NEW_HOST_DAYS * DAY_MS;
}

/**
 * Counts one invite or profile view for a host in its first 30 days. After that the call is
 * allowed and does not touch the limiter.
 */
export async function consumeNewHostDaily(
  db: DbOrTx,
  orgId: string,
  action: NewHostAction,
  createdAt: Date,
  now: Date = new Date(),
): Promise<RateLimitResult & { limited: boolean }> {
  const limit = NEW_HOST_DAILY_CAP[action];
  if (!newHostWindowOpen(createdAt, now)) {
    return { allowed: true, remaining: limit, resetAt: now, limited: false };
  }
  const result = await consume(db, `new-host:${orgId}:${action}`, limit, DAY_SEC, now);
  return { ...result, limited: true };
}
