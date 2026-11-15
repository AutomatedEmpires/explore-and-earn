// The map bbox filter casts geog to geometry, and the event jobs filter on occurred_at
// alone. These indexes are what make those plans index scans (audit K-2 and K-3).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows } from '@/lib/db';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const defs = (table: string) =>
  queryRows<{ indexdef: string }>(
    t.db,
    sql`select indexdef from pg_indexes where schemaname = 'app' and tablename = ${table}`,
  );

describe('discovery access indexes', () => {
  it('indexes the geometry cast the bbox filter uses, for active rows only', async () => {
    const rows = await defs('discovery_listings');
    const geom = rows.map((r) => r.indexdef).find((d) => /geometry/i.test(d));
    expect(geom).toBeDefined();
    expect(geom).toMatch(/using gist/i);
    expect(geom).toMatch(/geog/i);
    expect(geom).toMatch(/where is_active/i);
  });

  it('indexes listing events on occurred_at, with a partial index for the scrub', async () => {
    const rows = (await defs('listing_events')).map((r) => r.indexdef);
    expect(rows.some((d) => /using btree \(occurred_at\)$/i.test(d))).toBe(true);
    const scrub = rows.find((d) => /viewer_hash/i.test(d) && /dedupe_key/i.test(d));
    expect(scrub).toBeDefined();
    expect(scrub).toMatch(/occurred_at/i);
    expect(scrub).toMatch(/is not null/i);
  });
});
