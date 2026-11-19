// The SP3 tables (spec section 4): they exist with RLS on, their CHECKs and keys hold, seeker
// rows cascade from app.users, and the projection row helper writes a searchable row.
import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { PROJECTION_SELECT, projectionSelect, type ProjectionRow } from './projection-columns';

const TABLES = [
  'discovery_listings',
  'discovery_sync_state',
  'listing_dispositions',
  'listing_events',
  'listing_event_daily',
  'saved_searches',
  'saved_search_matches',
  'alert_settings',
  'landing_pages',
];

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function seedSeekerUser(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, account_type, adult_attested_at)
    values (${id}, ${`user_${id}`}, 'seeker', now())
  `);
  return id;
}

async function count(query: SQL): Promise<number> {
  const [row] = await queryRows<{ n: number }>(t.db, query);
  return row?.n ?? -1;
}

describe('SP3 tables', () => {
  it.each(TABLES)('app.%s exists with row level security on', async (table) => {
    const [row] = await queryRows<{ reg: string | null; rls: boolean | null }>(
      t.db,
      sql`
        select to_regclass(${`app.${table}`})::text as reg,
          (select relrowsecurity from pg_class where oid = to_regclass(${`app.${table}`})) as rls
      `,
    );
    expect(row?.reg).toBe(`app.${table}`);
    expect(row?.rls).toBe(true);
  });
});

/** Fails unless `p` rejects with a Postgres CHECK violation (not, say, a syntax error). */
async function expectCheckViolation(p: Promise<unknown>, constraint?: string): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const cause = (err as Error & { cause?: unknown }).cause;
  const message = cause instanceof Error ? cause.message : (err as Error).message;
  expect(message).toMatch(/violates check constraint/);
  if (constraint) expect(message).toContain(constraint);
}

describe('app.discovery_listings', () => {
  it('rejects free housing that is not provided', async () => {
    await expectCheckViolation(
      insertProjectionRows(t.db, [{ housingProvided: false, housingFree: true }]),
      'discovery_listings_housing_free_provided',
    );
  });

  it('rejects free meals that are not provided', async () => {
    await expectCheckViolation(
      insertProjectionRows(t.db, [{ mealsProvided: false, mealsFree: true }]),
      'discovery_listings_meals_free_provided',
    );
  });

  it('rejects zero weekly hours', async () => {
    await expectCheckViolation(insertProjectionRows(t.db, [{ weeklyHours: 0 }]), 'weekly_hours');
  });

  it('accepts the 120 weekly hours SP2 allows', async () => {
    await insertProjectionRows(t.db, [{ weeklyHours: 120 }]);
  });

  it('rejects an unknown category', async () => {
    await expectCheckViolation(
      insertProjectionRows(t.db, [{ category: 'beach' as never, categories: ['seasonal'] }]),
      'category',
    );
  });

  it('writes the default row: searchable, at its point, active', async () => {
    const [id] = await insertProjectionRows(t.db, [{}]);
    const [row] = await queryRows<{
      matches: boolean;
      lat: number;
      lng: number;
      is_active: boolean;
      title: string;
    }>(
      t.db,
      sql`
        select search @@ to_tsquery('english', 'lift') as matches,
          ST_Y(geog::geometry) as lat, ST_X(geog::geometry) as lng, is_active, title
        from app.discovery_listings where listing_id = ${id}
      `,
    );
    expect(row).toEqual({
      matches: true,
      lat: 39.48,
      lng: -106.04,
      is_active: true,
      title: 'Lift operator',
    });
  });

  it('searches an overridden title, not the default one', async () => {
    const [id] = await insertProjectionRows(t.db, [{ title: 'Dishwasher' }]);
    const [row] = await queryRows<{ lift: boolean; dish: boolean }>(
      t.db,
      sql`
        select search @@ to_tsquery('english', 'lift') as lift,
          search @@ to_tsquery('english', 'dishwasher') as dish
        from app.discovery_listings where listing_id = ${id}
      `,
    );
    expect(row).toEqual({ lift: false, dish: true });
  });

  it('reads back through PROJECTION_SELECT as a ProjectionRow', async () => {
    const publishedAt = new Date('2026-10-30T12:00:00.000Z');
    const cover = { src: { 320: 'a', 640: 'b', 1280: 'c' }, alt: 'Chairlift' };
    const [id] = await insertProjectionRows(t.db, [{ publishedAt, cover }]);
    const [row] = await queryRows<ProjectionRow>(
      t.db,
      sql`select ${PROJECTION_SELECT} from app.discovery_listings where listing_id = ${id}`,
    );
    expect(row).toMatchObject({
      listingId: id,
      title: 'Lift operator',
      categories: ['seasonal'],
      state: 'CO',
      lat: 39.48,
      lng: -106.04,
      weeklyHours: 40,
      payHourlyMinCents: 1900,
      payYearlyMinCents: 3952000,
      startOn: '2026-12-01',
      publishedAt: '2026-10-30T12:00:00.000Z',
      firstActiveAt: '2026-10-30T12:00:00.000Z',
      closedAt: null,
      cover,
      remoteStates: [],
      payDetails: ['Paid every 2 weeks'],
    });
    const [aliased] = await queryRows<ProjectionRow>(
      t.db,
      sql`select ${projectionSelect('dl')} from app.discovery_listings dl where dl.listing_id = ${id}`,
    );
    expect(aliased).toEqual(row);
  });

  it('returns the listing ids in input order', async () => {
    const a = newId();
    const b = newId();
    expect(await insertProjectionRows(t.db, [{ listingId: a }, { listingId: b }])).toEqual([a, b]);
  });
});

describe('app.listing_events', () => {
  it('keeps one row per dedupe key', async () => {
    const listingId = newId();
    const orgId = newId();
    for (let i = 0; i < 2; i++) {
      await t.db.execute(sql`
        insert into app.listing_events (id, listing_id, org_id, type, source, dedupe_key, occurred_at)
        values (${newId()}, ${listingId}, ${orgId}, 'view', 'seek', ${`view:x:${listingId}:1`}, now())
        on conflict (dedupe_key) do nothing
      `);
    }
    expect(
      await count(
        sql`select count(*)::int as n from app.listing_events where listing_id = ${listingId}`,
      ),
    ).toBe(1);
  });

  it('rejects an unknown source', async () => {
    await expectCheckViolation(
      t.db.execute(sql`
        insert into app.listing_events (id, listing_id, org_id, type, source, occurred_at)
        values (${newId()}, ${newId()}, ${newId()}, 'view', 'tiktok', now())
      `),
      'source',
    );
  });
});

describe('app.saved_searches', () => {
  const insert = (userId: string, name: string, hash: string) =>
    t.db.execute(sql`
      insert into app.saved_searches (id, user_id, name, query, query_hash)
      values (${newId()}, ${userId}, ${name}, '{}'::jsonb, ${hash})
    `);

  it('is unique per user and query hash', async () => {
    const userId = await seedSeekerUser();
    await insert(userId, 'Ski resorts', 'h1');
    const dup = await insert(userId, 'Ski resorts again', 'h1').then(
      () => null,
      (e: unknown) => e as Error & { cause?: Error },
    );
    expect(dup?.cause?.message ?? dup?.message).toMatch(/saved_searches_user_query_key/);
    await insert(userId, 'Farm', 'h2');
    await insert(await seedSeekerUser(), 'Ski resorts', 'h1');
  });

  it('needs a name of 1 to 80 characters', async () => {
    const userId = await seedSeekerUser();
    await expectCheckViolation(insert(userId, '', 'h3'), 'name');
    await expectCheckViolation(insert(userId, 'x'.repeat(81), 'h4'), 'name');
    await insert(userId, 'x'.repeat(80), 'h5');
  });
});

describe('deleting a user', () => {
  it('removes their dispositions, saved searches with matches, and alert settings', async () => {
    const userId = await seedSeekerUser();
    const other = await seedSeekerUser();
    const searchId = newId();
    const listingId = newId();
    for (const u of [userId, other]) {
      await t.db.execute(sql`
        insert into app.listing_dispositions (user_id, listing_id, state, source, acted_at)
        values (${u}, ${listingId}, 'saved', 'seek', now())
      `);
      await t.db.execute(sql`insert into app.alert_settings (user_id) values (${u})`);
    }
    await t.db.execute(sql`
      insert into app.saved_searches (id, user_id, name, query, query_hash)
      values (${searchId}, ${userId}, 'All jobs', '{}'::jsonb, 'h')
    `);
    await t.db.execute(sql`
      insert into app.saved_search_matches (saved_search_id, listing_id, matched_at)
      values (${searchId}, ${listingId}, now())
    `);

    await t.db.execute(sql`delete from app.users where id = ${userId}`);

    expect(
      await count(
        sql`select count(*)::int as n from app.listing_dispositions where user_id = ${userId}`,
      ),
    ).toBe(0);
    expect(
      await count(sql`select count(*)::int as n from app.saved_searches where user_id = ${userId}`),
    ).toBe(0);
    expect(
      await count(
        sql`select count(*)::int as n from app.saved_search_matches where saved_search_id = ${searchId}`,
      ),
    ).toBe(0);
    expect(
      await count(sql`select count(*)::int as n from app.alert_settings where user_id = ${userId}`),
    ).toBe(0);
    // Another user's rows stay.
    expect(
      await count(
        sql`select count(*)::int as n from app.listing_dispositions where user_id = ${other}`,
      ),
    ).toBe(1);
    expect(
      await count(sql`select count(*)::int as n from app.alert_settings where user_id = ${other}`),
    ).toBe(1);
  });
});
