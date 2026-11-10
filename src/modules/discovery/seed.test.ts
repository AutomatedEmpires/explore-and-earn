// The synthetic seeder (SP3 plan Task 11): the same seed writes the same rows, the mix holds
// (Remote 27–33%, every category, about count / 4.2 locations), and prod refuses it.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows, type Db } from '@/lib/db';
import { seedSynthetic } from './seed';

const env = vi.hoisted(() => ({ appEnv: null as 'dev' | 'preview' | 'prod' | null }));

// Only APP_ENV changes: a full prod environment would fail to parse long before the guard.
vi.mock('@/lib/env', async (orig) => {
  const real = await orig<typeof import('@/lib/env')>();
  return {
    ...real,
    getEnv: () => {
      const e = real.getEnv();
      return env.appEnv ? { ...e, APP_ENV: env.appEnv } : e;
    },
  };
});

const NOW = new Date('2026-11-10T15:00:00.000Z');
let first: TestDb;
let second: TestDb;

beforeAll(async () => {
  [first, second] = await Promise.all([createTestDb(), createTestDb()]);
  await seedSynthetic(first.db, { count: 2000, seed: 42, now: NOW });
  // Later the same day: the rows depend on the day only.
  await seedSynthetic(second.db, { count: 2000, seed: 42, now: new Date('2026-11-10T23:59:00Z') });
});

afterAll(async () => {
  await Promise.all([first.close(), second.close()]);
});

async function digest(db: Db): Promise<string> {
  const [row] = await queryRows<{ d: string; n: number }>(
    db,
    sql`select md5(string_agg((to_jsonb(dl) - 'created_at' - 'updated_at')::text, '|'
        order by dl.listing_id)) as d, count(*)::int as n
      from app.discovery_listings dl`,
  );
  return `${row?.n}:${row?.d}`;
}

describe('seedSynthetic', () => {
  it('writes identical rows for the same seed', async () => {
    const a = await digest(first.db);
    expect(a.startsWith('2000:')).toBe(true);
    expect(await digest(second.db)).toBe(a);
  });

  it('keeps the category, Remote and location mix', async () => {
    const [mix] = await queryRows<{
      remote: number;
      categories: number;
      locations: number;
      hourly: number;
      units: number;
      active: number;
    }>(
      first.db,
      sql`select
          avg(case when remote then 1 else 0 end)::float8 as remote,
          count(distinct category)::int as categories,
          count(distinct location_id)::int as locations,
          count(pay_hourly_min_cents)::int as hourly,
          count(distinct substring(pay_full from '/([a-z]+)$'))::int as units,
          count(*) filter (where is_active)::int as active
        from app.discovery_listings`,
    );
    expect(mix?.remote).toBeGreaterThanOrEqual(0.27);
    expect(mix?.remote).toBeLessThanOrEqual(0.33);
    expect(mix?.categories).toBe(4);
    expect(mix?.locations).toBeGreaterThan(350);
    expect(mix?.locations).toBeLessThanOrEqual(Math.round(2000 / 4.2));
    expect(mix?.hourly).toBeGreaterThan(1500);
    expect(mix?.units).toBe(6);
    expect(mix?.active).toBe(2000);
  });

  it('spreads publish dates over 90 days and starts over the next 9 months', async () => {
    const [span] = await queryRows<{ oldest: string; newest: string; first: string; last: string }>(
      first.db,
      sql`select min(published_at)::date::text as oldest, max(published_at)::date::text as newest,
          min(start_on) filter (where schedule_kind = 'fixed')::text as first,
          max(start_on) filter (where schedule_kind = 'fixed')::text as last
        from app.discovery_listings`,
    );
    expect(span?.oldest && span.oldest >= '2026-08-12').toBe(true);
    expect(span?.newest && span.newest <= '2026-11-10').toBe(true);
    expect(span?.first && span.first >= '2026-11-10').toBe(true);
    expect(span?.last && span.last <= '2027-08-07').toBe(true);
  });

  it('refuses to run in prod', async () => {
    env.appEnv = 'prod';
    try {
      await expect(seedSynthetic(first.db, { count: 10, seed: 1 })).rejects.toThrow(
        'seedSynthetic is not allowed in prod',
      );
    } finally {
      env.appEnv = null;
    }
  });
});
