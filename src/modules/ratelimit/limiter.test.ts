import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { NEW_HOST_DAILY_CAP, consume, consumeNewHostDaily, newHostWindowOpen } from './index';

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

  it('allows every call in perf mode and writes no rate-limit row', async () => {
    process.env.PERF_MODE = '1';
    process.env.PERF_SECRET = 'p'.repeat(32);
    resetEnvCache();
    try {
      for (let i = 0; i < 100; i++) {
        expect(await consume(t.db, 'test:perf', 1, 60)).toMatchObject({ allowed: true, remaining: 1 });
      }
      const rows = await queryRows<{ n: number }>(
        t.db,
        sql`select count(*)::int as n from app.rate_limits where key = 'test:perf'`,
      );
      expect(rows[0]?.n).toBe(0);
    } finally {
      delete process.env.PERF_MODE;
      delete process.env.PERF_SECRET;
      resetEnvCache();
    }
  });

  it('rejects a non-positive window or a negative limit', async () => {
    await expect(consume(t.db, 'test:bad', 1, 0)).rejects.toThrow(/windowSec/);
    await expect(consume(t.db, 'test:bad', -1, 60)).rejects.toThrow(/limit/);
  });

  const created = new Date('2026-01-01T00:00:00Z');
  const dayMs = 86_400_000;
  const inside = new Date(created.getTime() + 29 * dayMs);
  const boundary = new Date(created.getTime() + 30 * dayMs);

  it('applies each cap inside the first 30 days and stops at the boundary', async () => {
    expect(newHostWindowOpen(created, new Date(boundary.getTime() - 1))).toBe(true);
    expect(newHostWindowOpen(created, boundary)).toBe(false);

    for (let i = 0; i < NEW_HOST_DAILY_CAP.invites; i++) {
      expect((await consumeNewHostDaily(t.db, 'org-invites', 'invites', created, inside)).allowed).toBe(
        true,
      );
    }
    expect(await consumeNewHostDaily(t.db, 'org-invites', 'invites', created, inside)).toMatchObject({
      allowed: false,
      limited: true,
    });

    for (let i = 0; i < NEW_HOST_DAILY_CAP.profile_views; i++) {
      expect(
        (await consumeNewHostDaily(t.db, 'org-views', 'profile_views', created, inside)).allowed,
      ).toBe(true);
    }
    expect(
      await consumeNewHostDaily(t.db, 'org-views', 'profile_views', created, inside),
    ).toMatchObject({ allowed: false, limited: true });

    expect(await consumeNewHostDaily(t.db, 'org-invites', 'invites', created, boundary)).toMatchObject({
      allowed: true,
      limited: false,
    });
  });
});
