import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { purgeRateLimitWindows } from './index';

const BEFORE = new Date('2026-11-01T17:00:00.000Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.rate_limits`);
});

async function seed(key: string, windowStart: Date): Promise<void> {
  await t.db.execute(sql`
    insert into app.rate_limits (key, window_start, count)
    values (${key}, ${windowStart.toISOString()}::timestamptz, 1)
  `);
}

async function keys(): Promise<string[]> {
  const rows = await queryRows<{ key: string }>(
    t.db,
    sql`select key from app.rate_limits order by key`,
  );
  return rows.map((row) => row.key);
}

describe('purgeRateLimitWindows', () => {
  it('keeps a window that started exactly at the cutoff and deletes one 1 ms older', async () => {
    await seed('at-limit', BEFORE);
    await seed('older', new Date(BEFORE.getTime() - 1));
    await seed('newer', new Date(BEFORE.getTime() + 1));

    expect(await purgeRateLimitWindows(t.db, BEFORE, 100)).toBe(1);
    expect(await keys()).toEqual(['at-limit', 'newer']);
  });

  it('deletes at most `limit` windows, oldest first', async () => {
    await seed('a', new Date(BEFORE.getTime() - 3000));
    await seed('b', new Date(BEFORE.getTime() - 2000));
    await seed('c', new Date(BEFORE.getTime() - 1000));

    expect(await purgeRateLimitWindows(t.db, BEFORE, 2)).toBe(2);
    expect(await keys()).toEqual(['c']);
  });
});
