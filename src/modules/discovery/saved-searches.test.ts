// Saved searches and alert settings (SP3 spec 5 and 8.10, plan Task 28): one search per query
// hash, the stored query without map bounds or a location, the per-user limit, the default name
// cut to 80 characters (Review Focus 4), owner checks, and the weekly digest switch.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { DEFAULT_ORG_ID, insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { seedSeeker } from '../../../tests/helpers/sp2';
import { queryRows } from '@/lib/db';
import { canonicalQuery, US_STATES, type DiscoveryQuery } from '@/lib/discovery';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { GENRES } from '@/lib/taxonomy';
import {
  createSavedSearch,
  deleteSavedSearch,
  getAlertSettings,
  listSavedSearches,
  setAlertSettings,
  updateSavedSearch,
} from './saved-searches';

let t: TestDb;
let userId: string;
let otherId: string;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.saved_search_matches`);
  await t.db.execute(sql`delete from app.saved_searches`);
  await t.db.execute(sql`delete from app.alert_settings`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  await t.db.execute(sql`delete from app.settings`);
  userId = (await seedSeeker(t.db)).userId;
  otherId = (await seedSeeker(t.db)).userId;
});

/** The AppError a promise rejects with. */
async function rejection(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error('expected a rejection');
}

const SKI: DiscoveryQuery = { genres: ['ski-resorts'], states: ['CO'] };

describe('createSavedSearch', () => {
  it('creates a search named by its filter summary, with push and the daily email on', async () => {
    const out = await createSavedSearch(t.db, userId, { query: SKI });
    expect(out.created).toBe(true);
    expect(out.item).toMatchObject({
      name: 'Ski resorts · CO',
      query: SKI,
      summary: 'Ski resorts · CO',
      pushEnabled: true,
      emailDaily: true,
    });
    expect(out.item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(out.item.createdAt).toISOString()).toBe(out.item.createdAt);
  });

  it('returns the existing search for the same query with its keys and arrays reordered', async () => {
    const first = await createSavedSearch(t.db, userId, {
      query: { states: ['CO', 'UT'], categories: ['seasonal', 'farm'], housing: 'provided' },
    });
    const again = await createSavedSearch(t.db, userId, {
      query: { housing: 'provided', categories: ['farm', 'seasonal'], states: ['UT', 'CO'] },
      name: 'A different name',
    });
    expect(again.created).toBe(false);
    expect(again.item.id).toBe(first.item.id);
    expect(again.item.name).toBe(first.item.name);
    const [row] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.saved_searches where user_id = ${userId}::uuid`,
    );
    expect(row?.n).toBe(1);
  });

  it('gives another user their own search for the same query', async () => {
    const mine = await createSavedSearch(t.db, userId, { query: SKI });
    const theirs = await createSavedSearch(t.db, otherId, { query: SKI });
    expect(theirs.created).toBe(true);
    expect(theirs.item.id).not.toBe(mine.item.id);
  });

  it('stores the query without map bounds or a location, hashed by its canonical form', async () => {
    const query: DiscoveryQuery = {
      categories: ['maritime'],
      bbox: [-150, 55, -140, 62],
      locationId: newId(),
    };
    const { item } = await createSavedSearch(t.db, userId, { query });
    expect(item.query).toEqual({ categories: ['maritime'] });
    const [row] = await queryRows<{ query: string; hash: string }>(
      t.db,
      sql`select query::text as query, query_hash as hash from app.saved_searches
        where id = ${item.id}::uuid`,
    );
    expect(JSON.parse(row?.query ?? '{}')).toEqual({ categories: ['maritime'] });
    const expected = Buffer.from(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(canonicalQuery({ categories: ['maritime'] })),
      ),
    ).toString('hex');
    expect(row?.hash).toBe(expected);
    // The same filters seen through a different map view are the same alert.
    const again = await createSavedSearch(t.db, userId, {
      query: { categories: ['maritime'], bbox: [-125, 24, -66, 50] },
    });
    expect(again).toMatchObject({ created: false, item: { id: item.id } });
  });

  it('throws conflict at the limit, with the number from the setting', async () => {
    await t.db.execute(
      sql`insert into app.settings (key, value) values ('discovery.saved_searches_per_user', '2'::jsonb)`,
    );
    await createSavedSearch(t.db, userId, { query: { categories: ['farm'] } });
    await createSavedSearch(t.db, userId, { query: { categories: ['remote'] } });
    const err = await rejection(
      createSavedSearch(t.db, userId, { query: { categories: ['maritime'] } }),
    );
    expect(err.code).toBe('conflict');
    expect(err.message).toBe('You can have up to 2 job alerts. Remove one to add another.');
    // An existing query is still found at the limit, and another user is unaffected.
    expect(
      (await createSavedSearch(t.db, userId, { query: { categories: ['farm'] } })).created,
    ).toBe(false);
    expect(
      (await createSavedSearch(t.db, otherId, { query: { categories: ['maritime'] } })).created,
    ).toBe(true);
  });

  it('uses the default limit of 20', async () => {
    const queries = US_STATES.slice(0, 20).map((s) => ({ states: [s.code] }));
    for (const query of queries) await createSavedSearch(t.db, userId, { query });
    const err = await rejection(
      createSavedSearch(t.db, userId, { query: { states: ['WY', 'MT'] } }),
    );
    expect(err.message).toBe('You can have up to 20 job alerts. Remove one to add another.');
  });

  it('cuts a long default name to 80 characters ending in "…" (Review Focus 4)', async () => {
    const query: DiscoveryQuery = {
      genres: GENRES.slice(0, 10).map((g) => g.code.replace(/_/g, '-')),
      states: US_STATES.slice(0, 10).map((s) => s.code),
      pay: { minCents: 2000, unit: 'hour' },
      housing: 'provided',
    };
    const out = await createSavedSearch(t.db, userId, { query });
    expect(out.created).toBe(true);
    expect(out.item.name.length).toBeLessThanOrEqual(80);
    expect(out.item.name.endsWith('…')).toBe(true);
    expect(out.item.summary).toBe(out.item.name);
  });

  it('names a search of no filters "All jobs"', async () => {
    const { item } = await createSavedSearch(t.db, userId, { query: {} });
    expect(item.name).toBe('All jobs');
  });

  it('names a host filter by the host', async () => {
    await insertProjectionRows(t.db, [{}]);
    const { item } = await createSavedSearch(t.db, userId, { query: { orgId: DEFAULT_ORG_ID } });
    expect(item.name).toBe('Kettle Ridge Lodge');
  });

  it('trims a given name and rejects an empty or 81-character one', async () => {
    const { item } = await createSavedSearch(t.db, userId, {
      query: SKI,
      name: '  Winter in Colorado  ',
    });
    expect(item.name).toBe('Winter in Colorado');
    expect(item.summary).toBe('Ski resorts · CO');
    for (const name of ['   ', 'x'.repeat(81)]) {
      const err = await rejection(
        createSavedSearch(t.db, userId, { query: { categories: ['farm'] }, name }),
      );
      expect(err.code).toBe('bad_request');
    }
    expect(
      (
        await createSavedSearch(t.db, userId, {
          query: { categories: ['farm'] },
          name: 'x'.repeat(80),
        })
      ).item.name,
    ).toHaveLength(80);
  });

  it('rejects a query outside the filter bounds', async () => {
    const err = await rejection(
      createSavedSearch(t.db, userId, {
        query: { states: ['ZZ'] } as unknown as DiscoveryQuery,
      }),
    );
    expect(err.code).toBe('bad_request');
  });
});

describe('listSavedSearches', () => {
  it("lists the user's own searches, oldest first, with fresh summaries", async () => {
    const a = await createSavedSearch(t.db, userId, { query: SKI, name: 'Mine' });
    const b = await createSavedSearch(t.db, userId, { query: { categories: ['farm'] } });
    await createSavedSearch(t.db, otherId, { query: { categories: ['remote'] } });
    // A summary is computed on every read: a stored label never goes stale.
    await t.db.execute(
      sql`update app.saved_searches set name = 'Renamed' where id = ${b.item.id}::uuid`,
    );
    const items = await listSavedSearches(t.db, userId);
    expect(items.map((i) => i.id)).toEqual([a.item.id, b.item.id]);
    expect(items.map((i) => [i.name, i.summary])).toEqual([
      ['Mine', 'Ski resorts · CO'],
      ['Renamed', 'Farm'],
    ]);
    expect(await listSavedSearches(t.db, newId())).toEqual([]);
  });
});

describe('updateSavedSearch', () => {
  it('renames and switches push and the daily email', async () => {
    const { item } = await createSavedSearch(t.db, userId, { query: SKI });
    const out = await updateSavedSearch(t.db, userId, item.id, {
      name: ' Colorado skiing ',
      pushEnabled: false,
    });
    expect(out).toMatchObject({
      id: item.id,
      name: 'Colorado skiing',
      pushEnabled: false,
      emailDaily: true,
    });
    const again = await updateSavedSearch(t.db, userId, item.id, { emailDaily: false });
    expect(again).toMatchObject({ name: 'Colorado skiing', pushEnabled: false, emailDaily: false });
    expect(await updateSavedSearch(t.db, userId, item.id, {})).toMatchObject({ emailDaily: false });
  });

  it("throws not_found for another user's search or an unknown id", async () => {
    const { item } = await createSavedSearch(t.db, userId, { query: SKI });
    expect(
      (await rejection(updateSavedSearch(t.db, otherId, item.id, { pushEnabled: false }))).code,
    ).toBe('not_found');
    expect(
      (await rejection(updateSavedSearch(t.db, userId, newId(), { pushEnabled: false }))).code,
    ).toBe('not_found');
    expect(
      (await rejection(updateSavedSearch(t.db, userId, 'nope', { pushEnabled: false }))).code,
    ).toBe('not_found');
    const [mine] = await listSavedSearches(t.db, userId);
    expect(mine?.pushEnabled).toBe(true);
  });

  it('rejects an empty name', async () => {
    const { item } = await createSavedSearch(t.db, userId, { query: SKI });
    expect((await rejection(updateSavedSearch(t.db, userId, item.id, { name: ' ' }))).code).toBe(
      'bad_request',
    );
  });
});

describe('deleteSavedSearch', () => {
  it('deletes the search with its matches', async () => {
    const { item } = await createSavedSearch(t.db, userId, { query: SKI });
    const kept = await createSavedSearch(t.db, userId, { query: { categories: ['farm'] } });
    const [listing] = (await insertProjectionRows(t.db, [{}])) as [string];
    for (const id of [item.id, kept.item.id]) {
      await t.db
        .execute(sql`insert into app.saved_search_matches (saved_search_id, listing_id, matched_at)
        values (${id}::uuid, ${listing}::uuid, now())`);
    }
    await deleteSavedSearch(t.db, userId, item.id);
    expect((await listSavedSearches(t.db, userId)).map((i) => i.id)).toEqual([kept.item.id]);
    const matches = await queryRows<{ id: string }>(
      t.db,
      sql`select saved_search_id::text as id from app.saved_search_matches`,
    );
    expect(matches.map((m) => m.id)).toEqual([kept.item.id]);
  });

  it("throws not_found for another user's search, leaving it in place", async () => {
    const { item } = await createSavedSearch(t.db, userId, { query: SKI });
    expect((await rejection(deleteSavedSearch(t.db, otherId, item.id))).code).toBe('not_found');
    expect((await rejection(deleteSavedSearch(t.db, userId, 'nope'))).code).toBe('not_found');
    expect(await listSavedSearches(t.db, userId)).toHaveLength(1);
  });
});

describe('alert settings', () => {
  it('defaults to no weekly digest, and setting it upserts', async () => {
    expect(await getAlertSettings(t.db, userId)).toEqual({ weeklyDigest: false });
    expect(await setAlertSettings(t.db, userId, { weeklyDigest: true })).toEqual({
      weeklyDigest: true,
    });
    expect(await getAlertSettings(t.db, userId)).toEqual({ weeklyDigest: true });
    expect(await getAlertSettings(t.db, otherId)).toEqual({ weeklyDigest: false });
    await setAlertSettings(t.db, userId, { weeklyDigest: false });
    expect(await getAlertSettings(t.db, userId)).toEqual({ weeklyDigest: false });
  });

  it('keeps the push counters when the digest changes', async () => {
    await t.db.execute(sql`insert into app.alert_settings (user_id, push_day, push_count)
      values (${userId}::uuid, current_date, 3)`);
    await setAlertSettings(t.db, userId, { weeklyDigest: true });
    const [row] = await queryRows<{ n: number }>(
      t.db,
      sql`select push_count as n from app.alert_settings where user_id = ${userId}::uuid`,
    );
    expect(row?.n).toBe(3);
  });
});
