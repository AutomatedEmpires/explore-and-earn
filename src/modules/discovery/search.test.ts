// The filter builder, keyset cursors, search and counts (SP3 spec 8.1, 8.3 and 8.4; plan
// Task 18): one case per filter rule, the exclusions on each surface, every sort, paging with
// no duplicate or missing id, cursor mismatches and the 10,000 cap.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { queryRows } from '@/lib/db';
import { addDays, todayIn, type DiscoveryQuery } from '@/lib/discovery';
import { isAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { ProjectionRowInput } from './projection-columns';
import { decodeCursor, cursorHash, encodeCursor } from './cursor';
import { bboxSql, buildFilterSql } from './filters';
import {
  noopHook,
  registerSeekerOverlay,
  resetSeekerOverlayForTests,
  setPlacementHookForTests,
} from './hooks';
import {
  countNewListings,
  filterListingIds,
  getJobCards,
  matchListingIds,
  searchListings,
  type SearchInput,
} from './search';

let t: TestDb;
const DAY = 86_400_000;
const NOW = new Date();
const TODAY = todayIn('UTC', NOW);

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.listing_dispositions`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  setPlacementHookForTests(noopHook);
});

afterEach(() => {
  setPlacementHookForTests(null);
  resetSeekerOverlayForTests();
});

const seed = (rows: Partial<ProjectionRowInput>[]) => insertProjectionRows(t.db, rows, NOW);

const search = (over: Partial<SearchInput> = {}) =>
  searchListings(t.db, {
    query: {},
    sort: 'relevant',
    surface: 'seek',
    tz: 'UTC',
    viewerUserId: null,
    viewerKey: 'guest-key',
    limit: 50,
    ...over,
  });

const ids = async (over: Partial<SearchInput> = {}) =>
  (await search(over)).items.map((c) => c.listingId);

/** The seeded ids that match `query` (input order), with "today" fixed. */
const matching = (all: string[], query: DiscoveryQuery, today = TODAY) =>
  filterListingIds(t.db, { listingIds: all, query, viewerUserId: null, surface: 'seek', today });

async function seeker(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, account_type, adult_attested_at)
    values (${id}, ${`user_${id}`}, 'seeker', now())`);
  return id;
}

async function dispose(userId: string, listingId: string, state: 'saved' | 'skipped') {
  await t.db.execute(sql`
    insert into app.listing_dispositions (user_id, listing_id, state, source, first_saved_at, acted_at)
    values (${userId}, ${listingId}, ${state}, 'seek', now(), now())`);
}

/** Copies the row `templateId` `n` times under new ids, in one generate_series statement. */
async function cloneRows(templateId: string, n: number) {
  const [row] = await queryRows<{ cols: string }>(
    t.db,
    sql`select string_agg(column_name, ', ' order by ordinal_position) as cols
      from information_schema.columns
      where table_schema = 'app' and table_name = 'discovery_listings'`,
  );
  const cols = (row?.cols ?? '').split(', ');
  const values = cols.map((c) => (c === 'listing_id' ? 'gen_random_uuid()' : `d.${c}`));
  await t.db.execute(sql`
    insert into app.discovery_listings (${sql.raw(cols.join(', '))})
    select ${sql.raw(values.join(', '))}
    from app.discovery_listings d, generate_series(1, ${n}::int) g
    where d.listing_id = ${templateId}::uuid`);
}

describe('q', () => {
  it('matches words, a single-word prefix, and ignores stopwords and punctuation', async () => {
    const [lift, dish, ranch] = await seed([
      { title: 'Lift operator' },
      { title: 'Dishwasher' },
      { title: 'Ranch hand', hostName: "O'Brien Ranch" },
    ]);
    expect(await ids({ query: { q: 'lift' } })).toEqual([lift]);
    expect(await ids({ query: { q: 'lif' } })).toEqual([lift]);
    const none = await ids();
    expect(none).toHaveLength(3);
    for (const q of ['the', '&&']) expect(await ids({ query: { q } })).toEqual(none);
    // An apostrophe is no syntax error: "o'brien" is the phrase o <-> brien.
    expect(await ids({ query: { q: "o'brien" } })).toEqual([ranch]);
    expect(dish).toBeDefined();
  });
});

describe('filters', () => {
  it('categories match the primary or secondary category', async () => {
    const all = await seed([
      { title: 'Orchard hand', category: 'farm' },
      { title: 'Harvest crew', category: 'seasonal', secondaryCategory: 'farm' },
      { title: 'Deckhand', category: 'maritime' },
    ]);
    expect(await matching(all, { categories: ['farm'] })).toEqual(all.slice(0, 2));
  });

  it('genres, destination and orgId each match only their rows', async () => {
    const other = newId();
    const all = await seed([
      { genre: 'ski-resorts' },
      { genre: 'national-parks', destinationSlug: 'yellowstone' },
      { genre: 'summer-camps', orgId: other },
    ]);
    expect(await matching(all, { genres: ['ski-resorts'] })).toEqual([all[0]]);
    expect(await matching(all, { destination: 'yellowstone' })).toEqual([all[1]]);
    expect(await matching(all, { orgId: other })).toEqual([all[2]]);
  });

  it('states match on-site rows there and Remote rows open to them or the whole US', async () => {
    const all = await seed([
      { state: 'CO' },
      { remote: true, category: 'remote', remoteStates: ['CO'] },
      { remote: true, category: 'remote', remoteStates: ['US'] },
      { remote: true, category: 'remote', remoteStates: ['UT'], state: 'CO' },
      { state: 'UT' },
    ]);
    expect(await matching(all, { states: ['CO'] })).toEqual(all.slice(0, 3));
  });

  it('within 1 month clamps to the month end and keeps listings that begin now', async () => {
    const all = await seed([
      { startOn: null, endOn: null, scheduleKind: 'ongoing' },
      { startOn: '2026-01-10' },
      { startOn: '2026-02-28' },
      { startOn: '2026-03-01' },
    ]);
    expect(await matching(all, { start: { withinMonths: 1 } }, '2026-01-31')).toEqual(
      all.slice(0, 3),
    );
  });

  it('a season matches its season rows and fixed starts inside its window', async () => {
    const all = await seed([
      {
        scheduleKind: 'season',
        season: 'summer',
        seasonYear: 2026,
        startOn: '2026-06-01',
        endOn: '2026-08-31',
      },
      { startOn: '2026-07-04', endOn: '2026-08-01' },
      {
        scheduleKind: 'season',
        season: 'summer',
        seasonYear: 2027,
        startOn: '2027-06-01',
        endOn: '2027-08-31',
      },
    ]);
    expect(await matching(all, { start: { season: 'summer', year: 2026 } })).toEqual(
      all.slice(0, 2),
    );
  });

  it('year-round matches ongoing rows and the year_round season of that year', async () => {
    const all = await seed([
      { scheduleKind: 'ongoing', startOn: '2026-03-01', endOn: null },
      {
        scheduleKind: 'season',
        season: 'year_round',
        seasonYear: 2026,
        startOn: null,
        endOn: null,
      },
      {
        scheduleKind: 'season',
        season: 'year_round',
        seasonYear: 2027,
        startOn: null,
        endOn: null,
      },
      { startOn: '2026-05-01' },
    ]);
    expect(await matching(all, { start: { season: 'year_round', year: 2026 } })).toEqual(
      all.slice(0, 2),
    );
  });

  it('starting soon is today through today + 30', async () => {
    const today = '2026-05-10';
    const all = await seed([
      { startOn: today },
      { startOn: addDays(today, 30) },
      { startOn: addDays(today, -1) },
      { startOn: addDays(today, 31) },
      { startOn: null, scheduleKind: 'ongoing', endOn: null },
    ]);
    expect(await matching(all, { startingSoon: true }, today)).toEqual(all.slice(0, 2));
  });

  it('housing, meals and visas', async () => {
    const all = await seed([
      { housingProvided: true, housingFree: false },
      { housingProvided: true, housingFree: true },
      { housingProvided: false, mealsProvided: true, mealsFree: false },
      { housingProvided: false, mealsProvided: true, mealsFree: true, sponsorsVisas: true },
    ]);
    expect(await matching(all, { housing: 'provided' })).toEqual([all[0], all[1]]);
    expect(await matching(all, { housing: 'free' })).toEqual([all[1]]);
    expect(await matching(all, { meals: 'provided' })).toEqual([all[2], all[3]]);
    expect(await matching(all, { meals: 'free' })).toEqual([all[3]]);
    expect(await matching(all, { sponsorsVisas: true })).toEqual([all[3]]);
  });

  it('pay compares the bottom of the range per hour, per day (x8) and per year', async () => {
    const all = await seed([
      { payHourlyMinCents: 2000, payYearlyMinCents: 4_000_000 },
      { payHourlyMinCents: 1999, payYearlyMinCents: 3_999_999 },
      { payHourlyMinCents: null, payHourlyMaxCents: null, payYearlyMinCents: null },
    ]);
    expect(await matching(all, { pay: { minCents: 2000, unit: 'hour' } })).toEqual([all[0]]);
    expect(await matching(all, { pay: { minCents: 16000, unit: 'day' } })).toEqual([all[0]]);
    expect(await matching(all, { pay: { minCents: 4_000_000, unit: 'year' } })).toEqual([all[0]]);
  });

  it('bbox and locationId, with a box across the antimeridian (Review Focus 5)', async () => {
    const loc = newId();
    const all = await seed([
      { state: 'AK', lat: 52, lng: 175, locationId: loc },
      { state: 'AK', lat: 61, lng: -150 },
      { state: 'CO', lat: 39.48, lng: -106.04 },
    ]);
    expect(await matching(all, { bbox: [170, 50, -130, 72] })).toEqual(all.slice(0, 2));
    expect(await matching(all, { bbox: [-109.1, 36.9, -102, 41.1] })).toEqual([all[2]]);
    expect(await matching(all, { locationId: loc })).toEqual([all[0]]);
  });

  it('a wide viewport is a plain longitude and latitude box', async () => {
    const all = await seed([
      { state: 'TX', lat: 25.9, lng: -97.5 },
      { state: 'WA', lat: 49.9, lng: -100 },
      { state: 'HI', lat: 40, lng: -130 },
    ]);
    expect(await matching(all, { bbox: [-125, 24, -66, 50] })).toEqual(all.slice(0, 2));
    expect(await matching(all, { bbox: [-180, -60, 180, 72] })).toEqual(all);
    expect(bboxSql([1, 2, 3, 4])).toBeDefined();
  });

  it('always requires an active row', async () => {
    const all = await seed([{}, { isActive: false, closedAt: NOW }]);
    expect(await matching(all, {})).toEqual([all[0]]);
    expect(
      buildFilterSql(
        {},
        { today: TODAY, viewerUserId: null, surface: 'seek', applied: [], hidden: [] },
      ),
    ).toBeDefined();
  });
});

describe('exclusions', () => {
  it('drop skipped and hidden listings everywhere, and saved and applied ones on the deck', async () => {
    const blocked = newId();
    const [plain, skipped, saved, applied, hidden] = (await seed([
      { title: 'Plain' },
      { title: 'Skipped' },
      { title: 'Saved' },
      { title: 'Applied' },
      { title: 'Hidden', orgId: blocked },
    ])) as [string, string, string, string, string];
    const user = await seeker();
    await dispose(user, skipped, 'skipped');
    await dispose(user, saved, 'saved');
    registerSeekerOverlay({
      appliedListingIds: async (_db, _u, list) =>
        new Set(list === 'all' ? [applied] : list.filter((x) => x === applied)),
      hiddenOrgIds: async () => [blocked],
    });

    const set = async (surface: SearchInput['surface'], viewerUserId: string | null) =>
      new Set(await ids({ surface, viewerUserId }));
    expect(await set('seek', user)).toEqual(new Set([plain, saved, applied]));
    expect(await set('map_list', user)).toEqual(new Set([plain, saved, applied]));
    expect(await set('swipe', user)).toEqual(new Set([plain]));
    expect(await set('swipe', null)).toEqual(new Set([plain, skipped, saved, applied, hidden]));

    const seek = await search({ viewerUserId: user });
    expect(seek.items.find((c) => c.listingId === saved)?.viewer).toEqual({
      disposition: 'saved',
      applied: false,
    });
    expect(seek.items.find((c) => c.listingId === applied)?.viewer).toEqual({
      disposition: null,
      applied: true,
    });
  });
});

describe('sorts', () => {
  it('relevant with q: rank, then the 90-day bucket, then the publish date', async () => {
    const at = (days: number) => new Date(NOW.getTime() - days * DAY);
    const [inDescription, late, soonOld, soonNew] = await seed([
      {
        title: 'Dishwasher',
        vector: {
          title: 'Dishwasher',
          occupationLabel: null,
          hostName: null,
          genreLabel: null,
          categoryLabel: null,
          destinationName: null,
          city: null,
          stateName: null,
          description: 'Help at the lift line',
        },
      },
      { title: 'Lift operator', startOn: addDays(TODAY, 100), publishedAt: at(1) },
      { title: 'Lift operator', startOn: addDays(TODAY, 20), publishedAt: at(5) },
      { title: 'Lift operator', startOn: addDays(TODAY, 20), publishedAt: at(2) },
    ]);
    expect(await ids({ query: { q: 'lift' } })).toEqual([soonNew, soonOld, late, inDescription]);
  });

  it('relevant without q drops the rank; newest is the publish date', async () => {
    const at = (days: number) => new Date(NOW.getTime() - days * DAY);
    const [late, old, recent] = await seed([
      { startOn: addDays(TODAY, 120), publishedAt: at(0.5) },
      { startOn: addDays(TODAY, 10), publishedAt: at(9) },
      { startOn: addDays(TODAY, 10), publishedAt: at(1) },
    ]);
    expect(await ids()).toEqual([recent, old, late]);
    expect(await ids({ sort: 'newest' })).toEqual([late, recent, old]);
  });

  it('distance: on-site by distance from the origin or the state centroid, then Remote', async () => {
    const [moab, remote, breck, denver] = await seed([
      { state: 'UT', city: 'Moab', lat: 38.57, lng: -109.55 },
      { remote: true, category: 'remote', remoteStates: ['CO'] },
      { lat: 39.48, lng: -106.04 },
      { state: 'CO', city: 'Denver', lat: 39.74, lng: -104.99 },
    ]);
    const origin = { lat: 39.74, lng: -104.99 };
    expect(await ids({ sort: 'distance', origin })).toEqual([denver, breck, moab, remote]);
    expect(await ids({ sort: 'distance', query: { states: ['CO'] } })).toEqual([
      denver,
      breck,
      remote,
    ]);
    expect(await ids({ sort: 'distance' })).toEqual(await ids({ sort: 'relevant' }));
  });
});

describe('paging', () => {
  it('45 matches in pages of 20, 20 and 5 with no duplicate or missing id', async () => {
    const at = (n: number) => new Date(NOW.getTime() - Math.floor(n / 4) * DAY);
    const all = await seed(Array.from({ length: 45 }, (_, n) => ({ publishedAt: at(n) })));
    const seen: string[] = [];
    let cursor: string | undefined;
    const sizes: number[] = [];
    for (;;) {
      const page = await search({ limit: 20, cursor });
      sizes.push(page.items.length);
      seen.push(...page.items.map((c) => c.listingId));
      expect(page.total).toBe(45);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(sizes).toEqual([20, 20, 5]);
    expect(new Set(seen).size).toBe(45);
    expect(new Set(seen)).toEqual(new Set(all));
  });

  it('pages through a ranked distance sort the same way', async () => {
    const all = await seed(
      Array.from({ length: 7 }, (_, n) => ({
        title: 'Lift operator',
        lat: 39 + n / 100,
        lng: -105,
      })),
    );
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await search({
        limit: 3,
        cursor,
        sort: 'distance',
        origin: { lat: 39, lng: -105 },
        query: { q: 'lift' },
      });
      seen.push(...page.items.map((c) => c.listingId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(all);
  });

  it('a cursor from another query, a garbled one or one with the wrong sort values is a 400', async () => {
    await seed([{ category: 'farm' }, { category: 'farm' }, { category: 'remote', remote: true }]);
    const first = await search({ query: { categories: ['farm'] }, limit: 1 });
    expect(first.nextCursor).not.toBeNull();
    const cursor = first.nextCursor ?? '';
    const code = async (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: unknown) => (isAppError(e) ? e.code : 'other'),
      );
    expect(await code(search({ query: { categories: ['remote'] }, cursor }))).toBe('bad_request');
    expect(await code(search({ query: { categories: ['farm'] }, cursor: 'garbage' }))).toBe(
      'bad_request',
    );
    const decoded = decodeCursor(cursor, cursorHash({ categories: ['farm'] }, 'relevant'));
    const forged = encodeCursor({ ...decoded, s: ['1 day', 'x'] });
    expect(await code(search({ query: { categories: ['farm'] }, cursor: forged }))).toBe(
      'bad_request',
    );
    expect(await code(search({ query: { categories: ['farm'] }, cursor }))).toBe('ok');
  });
});

describe('count', () => {
  it('caps the total at 10,000', async () => {
    const [template] = (await seed([{ state: 'TX' }])) as [string];
    await cloneRows(template, 10_000);
    const big = await search({ limit: 1 });
    expect(big).toMatchObject({ total: 10_000, totalCapped: true });
    await t.db.execute(sql`delete from app.discovery_listings`);
    await seed([{}, {}, {}]);
    expect(await search({ limit: 1 })).toMatchObject({ total: 3, totalCapped: false });
  });
});

describe('cards by id and counts', () => {
  it('getJobCards keeps active cards in input order, labeled when boosted', async () => {
    const [a, closed, b] = (await seed([{}, { isActive: false, closedAt: NOW }, {}])) as [
      string,
      string,
      string,
    ];
    setPlacementHookForTests({ ...noopHook, boostedAmong: async () => new Map([[b, 'b4']]) });
    const cards = await getJobCards(t.db, [b, closed, a]);
    expect(cards.map((c) => c.listingId)).toEqual([b, a]);
    expect(cards[0]?.boosted).toEqual({ boostId: 'b4' });
    expect(cards[0]?.href.endsWith('source=boost')).toBe(true);
    expect(cards[1]?.boosted).toBeNull();
    expect(cards[1]?.href.endsWith('source=other')).toBe(true);
  });

  it('matchListingIds is the Seek filter for this viewer', async () => {
    const [farm, sea] = (await seed([{ category: 'farm' }, { category: 'maritime' }])) as [
      string,
      string,
    ];
    expect(
      await matchListingIds(t.db, {
        listingIds: [sea, farm],
        query: { categories: ['farm'] },
        viewerUserId: null,
      }),
    ).toEqual([farm]);
  });

  it('countNewListings counts active listings first active since the date', async () => {
    const since = new Date(NOW.getTime() - 2 * DAY);
    const other = newId();
    await seed([
      { firstActiveAt: new Date(NOW.getTime() - DAY), housingProvided: true },
      { firstActiveAt: since, housingProvided: false, orgId: other },
      { firstActiveAt: new Date(NOW.getTime() - 3 * DAY) },
      { firstActiveAt: new Date(NOW.getTime() - DAY), isActive: false, closedAt: NOW },
    ]);
    expect(await countNewListings(t.db, { since })).toEqual({
      listings: 2,
      hosts: 2,
      withHousing: 1,
    });
  });
});
