// A seeker's discovery data for SP8 (SP3 plan Task 26): the export shape, erasure that leaves
// other users and the event tables alone, the privacy handler (idempotent, legal holds, org
// subjects) and the 90-day raw event retention rule.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { DEFAULT_ORG_ID, insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { seedSeeker } from '../../../tests/helpers/sp2';
import { queryRows, withTx } from '@/lib/db';
import type { DiscoveryQuery } from '@/lib/discovery';
import { newId } from '@/lib/ids';
import type { HoldScope } from '@/modules/privacy';
import { eraseUserData, exportUserData, privacyHandler, retentionRules } from './privacy';

const DAY_MS = 86_400_000;

let t: TestDb;
let maya: string;
let other: string;
let listings: string[];
let searchId: string;

const QUERY: DiscoveryQuery = { categories: ['farm'], states: ['CA'], housing: 'provided' };

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function seedUserData(userId: string, o: { weeklyDigest: boolean }): Promise<string> {
  const [a, b, c] = listings as [string, string, string];
  await t.db.execute(sql`
    insert into app.listing_dispositions (user_id, listing_id, state, source, first_saved_at, acted_at)
    values
      (${userId}::uuid, ${b}::uuid, 'saved', 'seek', '2026-11-02T09:00:00.000Z', '2026-11-02T09:00:00.000Z'),
      (${userId}::uuid, ${a}::uuid, 'saved', 'map', '2026-11-01T08:30:00.000Z', '2026-11-01T08:30:00.000Z'),
      (${userId}::uuid, ${c}::uuid, 'skipped', 'swipe', null, '2026-11-03T10:15:00.000Z')
  `);
  const id = newId();
  await t.db.execute(sql`
    insert into app.saved_searches
      (id, user_id, name, query, query_hash, push_enabled, email_daily, created_at)
    values (${id}::uuid, ${userId}::uuid, 'Farm jobs in California', ${JSON.stringify(QUERY)}::jsonb,
      ${`hash-${id}`}, false, false, '2026-11-04T12:00:00.000Z')
  `);
  await t.db.execute(sql`
    insert into app.saved_search_matches (saved_search_id, listing_id, matched_at, pushed_at)
    values (${id}::uuid, ${a}::uuid, '2026-11-05T13:00:00.000Z', '2026-11-05T14:00:00.000Z')
  `);
  await t.db.execute(sql`
    insert into app.alert_settings (user_id, weekly_digest, push_day, push_count)
    values (${userId}::uuid, ${o.weeklyDigest}, '2026-11-04', 2)
  `);
  return id;
}

beforeEach(async () => {
  for (const table of [
    'listing_events',
    'listing_dispositions',
    'saved_search_matches',
    'saved_searches',
    'alert_settings',
    'discovery_listings',
  ]) {
    await t.db.execute(sql`delete from ${sql.raw(`app.${table}`)}`);
  }
  maya = (await seedSeeker(t.db)).userId;
  other = (await seedSeeker(t.db)).userId;
  listings = await insertProjectionRows(t.db, [{}, { title: 'Deckhand' }, { title: 'Farmhand' }]);
  searchId = await seedUserData(maya, { weeklyDigest: true });
  await seedUserData(other, { weeklyDigest: false });
  // An event with no user in it, which erasure must leave alone.
  await t.db.execute(sql`
    insert into app.listing_events (id, listing_id, org_id, type, source, occurred_at)
    values (${newId()}::uuid, ${listings[0] ?? ''}::uuid, ${DEFAULT_ORG_ID}::uuid, 'save', 'seek', now())
  `);
});

const countsFor = async (userId: string) => {
  const [row] = await queryRows<Record<string, number>>(
    t.db,
    sql`select
      (select count(*)::int from app.listing_dispositions where user_id = ${userId}::uuid) as dispositions,
      (select count(*)::int from app.saved_searches where user_id = ${userId}::uuid) as searches,
      (select count(*)::int from app.saved_search_matches m
        join app.saved_searches s on s.id = m.saved_search_id where s.user_id = ${userId}::uuid) as matches,
      (select count(*)::int from app.alert_settings where user_id = ${userId}::uuid) as settings`,
  );
  return row;
};

const eventCount = async () =>
  (await queryRows<{ n: number }>(t.db, sql`select count(*)::int as n from app.listing_events`))[0]
    ?.n;

const ctx = (holds: HoldScope[] = []) => ({ requestId: 'req-1', now: new Date(), holds });

describe('exportUserData', () => {
  it('exports saved, skipped, saved searches and alert settings, each sorted by date', async () => {
    const [a, b, c] = listings as [string, string, string];
    expect(await exportUserData(t.db, maya)).toEqual({
      saved: [
        {
          listingId: a,
          at: '2026-11-01T08:30:00.000Z',
          source: 'map',
          firstSavedAt: '2026-11-01T08:30:00.000Z',
        },
        {
          listingId: b,
          at: '2026-11-02T09:00:00.000Z',
          source: 'seek',
          firstSavedAt: '2026-11-02T09:00:00.000Z',
        },
      ],
      skipped: [
        {
          listingId: c,
          at: '2026-11-03T10:15:00.000Z',
          source: 'swipe',
          firstSavedAt: null,
        },
      ],
      savedSearches: [
        {
          name: 'Farm jobs in California',
          query: QUERY,
          createdAt: '2026-11-04T12:00:00.000Z',
          pushEnabled: false,
          emailDaily: false,
        },
      ],
      savedSearchMatches: [
        {
          savedSearchId: searchId,
          listingId: a,
          matchedAt: '2026-11-05T13:00:00.000Z',
          pushedAt: '2026-11-05T14:00:00.000Z',
          dailyEmailedAt: null,
          weeklyEmailedAt: null,
        },
      ],
      alertSettings: { weeklyDigest: true, pushDay: '2026-11-04', pushCount: 2 },
    });
  });

  it('exports empty lists and the default settings for a user with no data', async () => {
    const fresh = (await seedSeeker(t.db)).userId;
    expect(await exportUserData(t.db, fresh)).toEqual({
      saved: [],
      skipped: [],
      savedSearches: [],
      savedSearchMatches: [],
      alertSettings: { weeklyDigest: false, pushDay: null, pushCount: 0 },
    });
  });
});

describe('eraseUserData', () => {
  it("deletes the user's four kinds of rows and nothing of anyone else's", async () => {
    await eraseUserData(t.db, maya);
    expect(await countsFor(maya)).toEqual({
      dispositions: 0,
      searches: 0,
      matches: 0,
      settings: 0,
    });
    expect(await countsFor(other)).toEqual({
      dispositions: 3,
      searches: 1,
      matches: 1,
      settings: 1,
    });
    expect(await eventCount()).toBe(1);
    const left = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.saved_search_matches where saved_search_id = ${searchId}::uuid`,
    );
    expect(left[0]?.n).toBe(0);
  });
});

describe('privacyHandler', () => {
  it('exports the same rows for a user subject, and nothing for an org', async () => {
    const data = await exportUserData(t.db, maya);
    expect(await privacyHandler.exportData(t.db, { kind: 'user', userId: maya })).toEqual({
      records: {
        saved_jobs: data.saved,
        skipped_jobs: data.skipped,
        saved_searches: data.savedSearches,
        saved_search_matches: data.savedSearchMatches,
        alert_settings: [data.alertSettings],
      },
      files: [],
    });
    expect(await privacyHandler.exportData(t.db, { kind: 'org', orgId: DEFAULT_ORG_ID })).toEqual({
      records: {},
      files: [],
    });
  });

  it('erases inside the caller transaction, reporting the rows deleted, and is idempotent', async () => {
    const subject = { kind: 'user', userId: maya } as const;
    const first = await withTx(t.db, (tx) => privacyHandler.erase(tx, subject, ctx()));
    expect(first).toEqual({ erased: 5, retained: [] });
    expect(await countsFor(maya)).toEqual({
      dispositions: 0,
      searches: 0,
      matches: 0,
      settings: 0,
    });
    expect(await countsFor(other)).toMatchObject({ dispositions: 3, searches: 1, settings: 1 });
    expect(await eventCount()).toBe(1);

    const second = await withTx(t.db, (tx) => privacyHandler.erase(tx, subject, ctx()));
    expect(second).toEqual({ erased: 0, retained: [] });
  });

  it('rolls back with the caller transaction', async () => {
    await expect(
      withTx(t.db, async (tx) => {
        await privacyHandler.erase(tx, { kind: 'user', userId: maya }, ctx());
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await countsFor(maya)).toEqual({
      dispositions: 3,
      searches: 1,
      matches: 1,
      settings: 1,
    });
  });

  it('deletes nothing under a legal hold and names each table that has rows', async () => {
    const result = await withTx(t.db, (tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: maya }, ctx(['all'])),
    );
    expect(result).toEqual({
      erased: 0,
      retained: [
        { table: 'listing_dispositions', reason: 'legal_hold', until: null },
        { table: 'saved_searches', reason: 'legal_hold', until: null },
        { table: 'alert_settings', reason: 'legal_hold', until: null },
      ],
    });
    expect(await countsFor(maya)).toEqual({
      dispositions: 3,
      searches: 1,
      matches: 1,
      settings: 1,
    });

    // Only the tables with rows are named; another scope's hold does not stop erasure.
    await t.db.execute(sql`delete from app.alert_settings where user_id = ${maya}::uuid`);
    const partial = await withTx(t.db, (tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: maya }, ctx(['all'])),
    );
    expect(partial.retained.map((r) => r.table)).toEqual([
      'listing_dispositions',
      'saved_searches',
    ]);
    const scoped = await withTx(t.db, (tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: maya }, ctx(['applications'])),
    );
    expect(scoped).toEqual({ erased: 4, retained: [] });
  });

  it('erases nothing for an org subject', async () => {
    const result = await withTx(t.db, (tx) =>
      privacyHandler.erase(tx, { kind: 'org', orgId: DEFAULT_ORG_ID }, ctx()),
    );
    expect(result).toEqual({ erased: 0, retained: [] });
    expect(await countsFor(maya)).toEqual({
      dispositions: 3,
      searches: 1,
      matches: 1,
      settings: 1,
    });
    expect(privacyHandler.mediaColumns).toBeUndefined();
  });
});

describe('retentionRules', () => {
  it('deletes raw events older than 90 days, at most `limit` a run, keeping the boundary', async () => {
    const now = new Date('2026-11-10T04:00:00Z');
    const boundary = new Date(now.getTime() - 90 * DAY_MS);
    await t.db.execute(sql`delete from app.listing_events`);
    for (const when of [
      new Date(boundary.getTime() - 1000),
      new Date(boundary.getTime() - 2 * DAY_MS),
      new Date(boundary.getTime() - 30 * DAY_MS),
      boundary,
    ]) {
      await t.db.execute(sql`
        insert into app.listing_events (id, listing_id, org_id, type, source, occurred_at)
        values (${newId()}::uuid, ${listings[0] ?? ''}::uuid, ${DEFAULT_ORG_ID}::uuid, 'view', 'seek',
          ${when.toISOString()}::timestamptz)
      `);
    }
    const [rule] = retentionRules;
    expect(rule?.key).toBe('discovery.listing_events_raw');
    expect(await rule?.run(t.db, now, 2)).toEqual({ deleted: 2 });
    expect(await rule?.run(t.db, now, 2)).toEqual({ deleted: 1 });
    expect(await rule?.run(t.db, now, 2)).toEqual({ deleted: 0 });
    const left = await queryRows<{ at: string }>(
      t.db,
      sql`select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at
        from app.listing_events`,
    );
    expect(left).toEqual([{ at: boundary.toISOString() }]);
  });
});
