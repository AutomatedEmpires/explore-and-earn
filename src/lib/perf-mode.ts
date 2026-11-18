// Performance-seeder mode. A signed header selects a user without Clerk, and the rate limiter
// writes nothing. Refused when APP_ENV=prod (src/lib/env.ts).
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from './env';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPerfMode(env: Env): boolean {
  return env.PERF_MODE === '1';
}

/** `<userId>.<base64url HMAC-SHA256(secret, userId)>`. */
export function perfUserHeaderValue(userId: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(userId).digest('base64url');
  return `${userId}.${sig}`;
}

/**
 * The user id from `x-perf-user`, or null. Only a perf-mode environment accepts it, and only
 * when the signature matches and the id is a UUID.
 */
export function perfUserFromHeader(value: string | null, env: Env): string | null {
  if (!isPerfMode(env) || !env.PERF_SECRET || !value) return null;
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const userId = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!UUID.test(userId) || sig.length === 0) return null;
  const expected = createHmac('sha256', env.PERF_SECRET).update(userId).digest('base64url');
  const given = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return userId;
}
