import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../tests/helpers/db';
import { queryRows } from './db';
import { consume } from './rate-limit';

describe('consume (fixed-window rate limiter)', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  it('allows up to the limit inside one window, then blocks; the next window resets it', async () => {
    const at = new Date('2026-11-03T10:00:05Z');
    const a = await consume(t.db, 'test:limit-2', 2, 60, at);
    const b = await consume(t.db, 'test:limit-2', 2, 60, new Date('2026-11-03T10:00:30Z'));
    const c = await consume(t.db, 'test:limit-2', 2, 60, new Date('2026-11-03T10:00:59Z'));

    expect([a.allowed, b.allowed, c.allowed]).toEqual([true, true, false]);
    expect([a.remaining, b.remaining, c.remaining]).toEqual([1, 0, 0]);
    expect(c.resetAt.toISOString()).toBe('2026-11-03T10:01:00.000Z');

    const next = await consume(t.db, 'test:limit-2', 2, 60, new Date('2026-11-03T10:01:00Z'));
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(1);
    expect(next.resetAt.toISOString()).toBe('2026-11-03T10:02:00.000Z');
  });

  it('counts each key separately', async () => {
    const at = new Date('2026-11-03T11:00:00Z');
    expect((await consume(t.db, 'test:a', 1, 60, at)).allowed).toBe(true);
    expect((await consume(t.db, 'test:a', 1, 60, at)).allowed).toBe(false);
    expect((await consume(t.db, 'test:b', 1, 60, at)).allowed).toBe(true);
  });

  it('removes the earlier windows of a key when a new window starts', async () => {
    await consume(t.db, 'test:purge', 5, 60, new Date('2026-11-03T12:00:00Z'));
    await consume(t.db, 'test:purge', 5, 60, new Date('2026-11-03T12:01:00Z'));
    await consume(t.db, 'test:purge', 5, 60, new Date('2026-11-03T12:05:00Z'));

    const rows = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.rate_limits where key = 'test:purge'`,
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('rejects a non-positive window or a negative limit', async () => {
    await expect(consume(t.db, 'test:bad', 1, 0)).rejects.toThrow(/windowSec/);
    await expect(consume(t.db, 'test:bad', -1, 60)).rejects.toThrow(/limit/);
  });
});
