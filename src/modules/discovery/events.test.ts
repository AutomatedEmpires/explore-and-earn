// Listing events (SP3 plan Task 24): 30-minute dedupe, the 24-hour scrub, the daily rollup run
// twice, 90-day deletion, closed-row cleanup, counts by bucket and source, and the SP2 stats
// provider.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { DEFAULT_ORG_ID, insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { seedSeeker } from '../../../tests/helpers/sp2';
import { queryRows, type DbOrTx } from '@/lib/db';
import type { DiscoverySource, ListingEventType } from '@/lib/discovery';
import { newId } from '@/lib/ids';
import type { ListingStatsProvider } from '@/modules/listings';
import { hmacKey } from '@/server/viewer';
import {
  dedupeKeyFor,
  deleteRawEventsBefore,
  eventHandlers,
  getListingEventCounts,
  listingStats,
  recordListingEvent,
  runMaintenance,
} from './events';

const registered = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  registerListingStatsProvider: (name: string, fn: unknown) => {
    registered.set(name, fn);
  },
}));

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) =>
  utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));
const at = (day: string, time = '12:00:00') => new Date(`${day}T${time}Z`);
/** Postgres orders uuids as their hex text. */
const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
const byListing = (x: { listingId: string }, y: { listingId: string }) =>
  cmp(x.listingId, y.listingId);

let t: TestDb;
let a: string;
let b: string;
let otherOrgListing: string;
const OTHER_ORG = newId();

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.listing_events`);
  await t.db.execute(sql`delete from app.listing_event_daily`);
  await t.db.execute(sql`delete from app.listing_dispositions`);
  await t.db.execute(sql`delete from app.saved_search_matches`);
  await t.db.execute(sql`delete from app.saved_searches`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  [a, b, otherOrgListing] = (await insertProjectionRows(t.db, [
    {},
    { title: 'Deckhand' },
    { orgId: OTHER_ORG },
  ])) as [string, string, string];
});

type RawEvent = {
  listingId: string;
  type: ListingEventType;
  source: DiscoverySource;
  viewerHash: string | null;
  dedupeKey: string | null;
  orgId: string;
};

const events = () =>
  queryRows<RawEvent>(
    t.db,
    sql`select listing_id::text as "listingId", type, source, viewer_hash as "viewerHash",
      dedupe_key as "dedupeKey", org_id::text as "orgId"
      from app.listing_events order by occurred_at, id`,
  );

const daily = () =>
  queryRows<{ listingId: string; day: string; type: string; source: string; count: number }>(
    t.db,
    sql`select listing_id::text as "listingId", day::text as day, type, source, count
      from app.listing_event_daily order by listing_id, day, type, source`,
  );

/** A raw event written straight to the table (no projection lookup, no dedupe). */
async function rawEvent(
  db: DbOrTx,
  o: {
    listingId: string;
    at: Date;
    type?: ListingEventType;
    source?: DiscoverySource;
    orgId?: string;
    viewerHash?: string | null;
    dedupeKey?: string | null;
  },
): Promise<void> {
  await db.execute(sql`
    insert into app.listing_events
      (id, listing_id, org_id, type, source, viewer_hash, dedupe_key, occurred_at)
    values (${newId()}::uuid, ${o.listingId}::uuid, ${o.orgId ?? DEFAULT_ORG_ID}::uuid,
      ${o.type ?? 'view'}, ${o.source ?? 'seek'}, ${o.viewerHash ?? null}, ${o.dedupeKey ?? null},
      ${o.at.toISOString()}::timestamptz)
  `);
}

async function dailyRow(o: {
  listingId: string;
  day: string;
  count: number;
  type?: ListingEventType;
  source?: DiscoverySource;
  orgId?: string;
}): Promise<void> {
  await t.db.execute(sql`
    insert into app.listing_event_daily (listing_id, org_id, day, type, source, count)
    values (${o.listingId}::uuid, ${o.orgId ?? DEFAULT_ORG_ID}::uuid, ${o.day}::date,
      ${o.type ?? 'view'}, ${o.source ?? 'seek'}, ${o.count})
  `);
}

describe('dedupeKeyFor', () => {
  it('is <type>:<hmac(viewerKey)>:<listingId>:<30-minute bucket>', () => {
    const when = new Date('2026-11-10T12:10:00Z');
    const bucket = Math.floor(when.getTime() / 1000 / 1800);
    expect(dedupeKeyFor('view', 'viewer-1', a, when)).toBe(
      `view:${hmacKey('viewer-1')}:${a}:${bucket}`,
    );
    expect(dedupeKeyFor('view', 'viewer-1', a, new Date('2026-11-10T12:29:59Z'))).toBe(
      dedupeKeyFor('view', 'viewer-1', a, when),
    );
    expect(dedupeKeyFor('view', 'viewer-1', a, new Date('2026-11-10T12:30:00Z'))).not.toBe(
      dedupeKeyFor('view', 'viewer-1', a, when),
    );
    expect(dedupeKeyFor('share', 'viewer-1', a, when)).toMatch(/^share:/);
  });
});

describe('recordListingEvent', () => {
  const view = (when: Date, viewerKey = 'viewer-1', listingId = a) =>
    recordListingEvent(t.db, {
      listingId,
      type: 'view',
      source: 'seek',
      at: when,
      viewerKey,
      dedupeKey: dedupeKeyFor('view', viewerKey, listingId, when),
    });

  it('counts two views by one viewer in one 30-minute bucket once, and the next bucket again', async () => {
    await view(new Date('2026-11-10T12:05:00Z'));
    await view(new Date('2026-11-10T12:15:00Z'));
    expect(await events()).toHaveLength(1);
    await view(new Date('2026-11-10T12:35:00Z'));
    expect(await events()).toHaveLength(2);
    await view(new Date('2026-11-10T12:36:00Z'), 'viewer-2');
    expect(await events()).toHaveLength(3);
  });

  it("takes the org from the projection row and stores the viewer's hash, never the key", async () => {
    await view(new Date('2026-11-10T12:05:00Z'), 'user-key', otherOrgListing);
    const [row] = await events();
    expect(row).toMatchObject({
      listingId: otherOrgListing,
      orgId: OTHER_ORG,
      type: 'view',
      source: 'seek',
      viewerHash: hmacKey('user-key'),
    });
    expect(JSON.stringify(row)).not.toContain('user-key');
  });

  it('drops an event for a listing with no projection row, or a malformed id', async () => {
    await view(new Date(), 'viewer-1', newId());
    await recordListingEvent(t.db, { listingId: 'nope', type: 'view', source: 'seek' });
    expect(await events()).toEqual([]);
  });

  it('records an event without a viewer or dedupe key', async () => {
    await recordListingEvent(t.db, { listingId: a, type: 'apply', source: 'invite' });
    await recordListingEvent(t.db, { listingId: a, type: 'apply', source: 'invite' });
    expect(await events()).toMatchObject([
      { type: 'apply', source: 'invite', viewerHash: null, dedupeKey: null },
      { type: 'apply', source: 'invite', viewerHash: null, dedupeKey: null },
    ]);
  });
});

describe('runMaintenance', () => {
  const NOW = new Date('2026-11-10T04:15:00Z');

  it('nulls the viewer hash and dedupe key after 24 hours and leaves newer events alone', async () => {
    await rawEvent(t.db, {
      listingId: a,
      at: new Date(NOW.getTime() - DAY_MS - 60_000),
      viewerHash: 'old-hash',
      dedupeKey: 'old-key',
    });
    await rawEvent(t.db, {
      listingId: a,
      at: new Date(NOW.getTime() - DAY_MS + 60_000),
      viewerHash: 'new-hash',
      dedupeKey: 'new-key',
    });
    const result = await runMaintenance(t.db, NOW);
    expect(result.scrubbed).toBe(1);
    expect((await events()).map((e) => [e.viewerHash, e.dedupeKey])).toEqual([
      [null, null],
      ['new-hash', 'new-key'],
    ]);
    expect((await runMaintenance(t.db, NOW)).scrubbed).toBe(0);
  });

  it("recomputes yesterday's daily rows, and a second run leaves identical rows", async () => {
    const yesterday = '2026-11-09';
    await rawEvent(t.db, { listingId: a, at: at(yesterday, '00:00:00') });
    await rawEvent(t.db, { listingId: a, at: at(yesterday, '23:59:59') });
    await rawEvent(t.db, { listingId: a, at: at(yesterday), source: 'map' });
    await rawEvent(t.db, { listingId: a, at: at(yesterday), type: 'save' });
    await rawEvent(t.db, { listingId: otherOrgListing, at: at(yesterday), orgId: OTHER_ORG });
    // Not yesterday: the day before, and today.
    await rawEvent(t.db, { listingId: a, at: at('2026-11-08', '23:59:59') });
    await rawEvent(t.db, { listingId: a, at: at('2026-11-10', '00:00:00') });
    // A stale row for yesterday is replaced, not added to.
    await dailyRow({ listingId: b, day: yesterday, count: 9 });

    const first = await runMaintenance(t.db, NOW);
    const rows = await daily();
    expect(first.rolledUp).toBe(4);
    expect(rows).toEqual(
      [
        { listingId: a, day: yesterday, type: 'save', source: 'seek', count: 1 },
        { listingId: a, day: yesterday, type: 'view', source: 'map', count: 1 },
        { listingId: a, day: yesterday, type: 'view', source: 'seek', count: 2 },
        { listingId: otherOrgListing, day: yesterday, type: 'view', source: 'seek', count: 1 },
      ].sort(byListing),
    );

    const second = await runMaintenance(t.db, NOW);
    expect(second.rolledUp).toBe(4);
    expect(await daily()).toEqual(rows);
  });

  it('deletes raw events older than 90 days', async () => {
    await rawEvent(t.db, { listingId: a, at: new Date(NOW.getTime() - 91 * DAY_MS) });
    await rawEvent(t.db, { listingId: a, at: new Date(NOW.getTime() - 89 * DAY_MS) });
    const result = await runMaintenance(t.db, NOW);
    expect(result.deletedEvents).toBe(1);
    expect(await events()).toHaveLength(1);
  });

  it('deletes a closed row 365 days after closed_at, with its dispositions and matches', async () => {
    const seeker = (await seedSeeker(t.db)).userId;
    const searchId = newId();
    await t.db.execute(sql`
      update app.discovery_listings set is_active = false,
        closed_at = ${new Date(NOW.getTime() - 366 * DAY_MS).toISOString()}::timestamptz
      where listing_id = ${a}::uuid
    `);
    await t.db.execute(sql`
      update app.discovery_listings set is_active = false,
        closed_at = ${new Date(NOW.getTime() - 300 * DAY_MS).toISOString()}::timestamptz
      where listing_id = ${b}::uuid
    `);
    await t.db.execute(sql`
      insert into app.listing_dispositions (user_id, listing_id, state, source, acted_at) values
        (${seeker}::uuid, ${a}::uuid, 'saved', 'seek', now()),
        (${seeker}::uuid, ${b}::uuid, 'saved', 'seek', now())
    `);
    await t.db.execute(sql`
      insert into app.saved_searches (id, user_id, name, query, query_hash)
      values (${searchId}::uuid, ${seeker}::uuid, 'Lifts', '{}'::jsonb, 'h1')
    `);
    await t.db.execute(sql`
      insert into app.saved_search_matches (saved_search_id, listing_id, matched_at) values
        (${searchId}::uuid, ${a}::uuid, now()), (${searchId}::uuid, ${b}::uuid, now())
    `);

    const result = await runMaintenance(t.db, NOW);
    expect(result.deletedClosed).toBe(1);
    const left = await queryRows<{ id: string }>(
      t.db,
      sql`select listing_id::text as id from app.discovery_listings order by listing_id`,
    );
    expect(left.map((r) => r.id)).toEqual([b, otherOrgListing].sort());
    const disp = await queryRows<{ id: string }>(
      t.db,
      sql`select listing_id::text as id from app.listing_dispositions`,
    );
    expect(disp.map((r) => r.id)).toEqual([b]);
    const matches = await queryRows<{ id: string }>(
      t.db,
      sql`select listing_id::text as id from app.saved_search_matches`,
    );
    expect(matches.map((r) => r.id)).toEqual([b]);
  });

  it('runs as the discovery.maintenance job', async () => {
    await rawEvent(t.db, { listingId: a, at: new Date(NOW.getTime() - 91 * DAY_MS) });
    await eventHandlers['discovery.maintenance']?.({}, { db: t.db, now: NOW });
    expect(await events()).toEqual([]);
  });
});

describe('deleteRawEventsBefore', () => {
  it('deletes at most `limit` events strictly before the cutoff', async () => {
    const cutoff = new Date('2026-08-01T00:00:00Z');
    for (let n = 1; n <= 3; n++) {
      await rawEvent(t.db, { listingId: a, at: new Date(cutoff.getTime() - n * 1000) });
    }
    await rawEvent(t.db, { listingId: a, at: cutoff });
    expect(await deleteRawEventsBefore(t.db, cutoff, 2)).toBe(2);
    expect(await deleteRawEventsBefore(t.db, cutoff, 2)).toBe(1);
    expect(await deleteRawEventsBefore(t.db, cutoff, 2)).toBe(0);
    expect(await events()).toHaveLength(1);
  });
});

describe('getListingEventCounts', () => {
  const today = utcDay(new Date());
  const yesterday = addDays(today, -1);
  const twoAgo = addDays(today, -2);
  const range = { from: at(twoAgo, '00:00:00'), to: at(addDays(today, 1), '00:00:00') };

  it('sums the daily rows for past days and the raw events for today, by day', async () => {
    await dailyRow({ listingId: a, day: twoAgo, count: 4 });
    await dailyRow({ listingId: a, day: twoAgo, count: 1, source: 'map' });
    await dailyRow({ listingId: a, day: yesterday, count: 2 });
    await dailyRow({ listingId: a, day: yesterday, count: 5, type: 'save' });
    await rawEvent(t.db, { listingId: a, at: at(today, '00:00:01') });
    await rawEvent(t.db, { listingId: a, at: at(today, '00:00:02'), source: 'boost' });
    // Raw events of a rolled-up day are already in its daily rows.
    await rawEvent(t.db, { listingId: a, at: at(yesterday) });
    // Outside the range, another org, and a type not asked for.
    await dailyRow({ listingId: a, day: addDays(today, -3), count: 7 });
    await dailyRow({ listingId: otherOrgListing, day: yesterday, count: 3, orgId: OTHER_ORG });
    await rawEvent(t.db, { listingId: a, at: at(today, '00:00:03'), type: 'share' });

    const rows = await getListingEventCounts(t.db, {
      orgId: DEFAULT_ORG_ID,
      ...range,
      types: ['view', 'save'],
      bucket: 'day',
    });
    expect(rows).toEqual([
      { listingId: a, bucketStart: twoAgo, type: 'view', source: null, count: 5 },
      { listingId: a, bucketStart: yesterday, type: 'save', source: null, count: 5 },
      { listingId: a, bucketStart: yesterday, type: 'view', source: null, count: 2 },
      { listingId: a, bucketStart: today, type: 'view', source: null, count: 2 },
    ]);
  });

  it('reads yesterday from the raw events until the nightly rollup has written it', async () => {
    await rawEvent(t.db, { listingId: a, at: at(yesterday, '01:00:00') });
    await rawEvent(t.db, { listingId: a, at: at(yesterday, '02:00:00') });
    await rawEvent(t.db, { listingId: b, at: at(yesterday, '03:00:00') });
    await dailyRow({ listingId: b, day: yesterday, count: 1 });
    const rows = await getListingEventCounts(t.db, {
      orgId: DEFAULT_ORG_ID,
      ...range,
      types: ['view'],
      bucket: 'none',
    });
    expect(rows).toEqual(
      [
        { listingId: a, bucketStart: null, type: 'view', source: null, count: 2 },
        { listingId: b, bucketStart: null, type: 'view', source: null, count: 1 },
      ].sort(byListing),
    );
  });

  it('starts week buckets on Monday', async () => {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const monday = addDays(today, -((dow + 6) % 7) - 21);
    await dailyRow({ listingId: a, day: addDays(monday, -1), count: 1 });
    await dailyRow({ listingId: a, day: monday, count: 2 });
    await dailyRow({ listingId: a, day: addDays(monday, 6), count: 3 });
    const rows = await getListingEventCounts(t.db, {
      orgId: DEFAULT_ORG_ID,
      from: at(addDays(monday, -7), '00:00:00'),
      to: at(addDays(monday, 7), '00:00:00'),
      types: ['view'],
      bucket: 'week',
    });
    expect(rows).toEqual([
      { listingId: a, bucketStart: addDays(monday, -7), type: 'view', source: null, count: 1 },
      { listingId: a, bucketStart: monday, type: 'view', source: null, count: 5 },
    ]);
  });

  it('gives one row per listing and type for bucket none, limited to listingIds', async () => {
    await dailyRow({ listingId: a, day: twoAgo, count: 1 });
    await dailyRow({ listingId: a, day: yesterday, count: 2 });
    await dailyRow({ listingId: a, day: yesterday, count: 1, type: 'save' });
    await dailyRow({ listingId: b, day: yesterday, count: 6 });
    await rawEvent(t.db, { listingId: a, at: at(today, '00:00:01') });

    const all = await getListingEventCounts(t.db, {
      orgId: DEFAULT_ORG_ID,
      ...range,
      types: ['view', 'save'],
      bucket: 'none',
    });
    const expected = [
      { listingId: a, bucketStart: null, type: 'save', source: null, count: 1 },
      { listingId: a, bucketStart: null, type: 'view', source: null, count: 4 },
      { listingId: b, bucketStart: null, type: 'view', source: null, count: 6 },
    ].sort((x, y) => byListing(x, y) || cmp(x.type, y.type));
    expect(all).toEqual(expected);

    const onlyB = await getListingEventCounts(t.db, {
      orgId: DEFAULT_ORG_ID,
      listingIds: [b],
      ...range,
      types: ['view', 'save'],
      bucket: 'none',
    });
    expect(onlyB).toEqual([
      { listingId: b, bucketStart: null, type: 'view', source: null, count: 6 },
    ]);
  });

  it('returns only the given sources, each row carrying its source', async () => {
    await dailyRow({ listingId: a, day: yesterday, count: 2, source: 'boost' });
    await dailyRow({ listingId: a, day: yesterday, count: 9, source: 'seek' });
    await rawEvent(t.db, { listingId: a, at: at(today, '00:00:01'), source: 'boost' });
    await rawEvent(t.db, { listingId: a, at: at(today, '00:00:02'), source: 'seek' });
    const rows = await getListingEventCounts(t.db, {
      orgId: DEFAULT_ORG_ID,
      ...range,
      types: ['view'],
      sources: ['boost'],
      bucket: 'none',
    });
    expect(rows).toEqual([
      { listingId: a, bucketStart: null, type: 'view', source: 'boost', count: 3 },
    ]);
  });

  it('returns nothing for an empty range, type list, listing list or source list', async () => {
    await dailyRow({ listingId: a, day: yesterday, count: 2 });
    const base = { orgId: DEFAULT_ORG_ID, ...range, types: ['view'] as ListingEventType[] };
    expect(await getListingEventCounts(t.db, { ...base, to: range.from, bucket: 'day' })).toEqual(
      [],
    );
    expect(await getListingEventCounts(t.db, { ...base, types: [], bucket: 'day' })).toEqual([]);
    expect(await getListingEventCounts(t.db, { ...base, listingIds: [], bucket: 'day' })).toEqual(
      [],
    );
    expect(await getListingEventCounts(t.db, { ...base, sources: [], bucket: 'day' })).toEqual([]);
  });
});

describe('listingStats', () => {
  it('is the provider registered as "discovery": all-time views and saves', async () => {
    await import('./index');
    const provider = registered.get('discovery') as ListingStatsProvider | undefined;
    expect(provider).toBe(listingStats);

    const today = utcDay(new Date());
    await dailyRow({ listingId: a, day: addDays(today, -200), count: 1 });
    await dailyRow({ listingId: a, day: addDays(today, -1), count: 1, source: 'map' });
    await dailyRow({ listingId: a, day: addDays(today, -1), count: 1, type: 'save' });
    await dailyRow({ listingId: a, day: addDays(today, -1), count: 4, type: 'share' });
    await rawEvent(t.db, { listingId: a, at: at(today, '00:00:01') });
    // Already in yesterday's daily rows.
    await rawEvent(t.db, { listingId: a, at: at(addDays(today, -1)) });

    const stats = await provider?.(t.db, [a, b]);
    expect(stats?.get(a)).toEqual({ views: 3, saves: 1 });
    expect(stats?.get(b)).toEqual({ views: 0, saves: 0 });
    expect(await listingStats(t.db, [])).toEqual(new Map());
  });
});
