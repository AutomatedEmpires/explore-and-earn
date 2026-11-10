// Boosted placement (SP3 spec 8.13 and 11, plan Task 19): a fake hook inserting a boosted slot,
// the cursor carrying its state and resuming after `organicConsumed`, `matchIds` applying the
// filters and exclusions, the 120 ms timeout and a throwing hook, and boostedAmong labels.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import type { ProjectionRowInput } from './projection-columns';
import { cursorHash, decodeCursor } from './cursor';
import {
  noopHook,
  registerSeekerOverlay,
  resetSeekerOverlayForTests,
  setPlacementHookForTests,
  type BoostPlacementHook,
  type PlacementInput,
} from './hooks';
import { placeWithTimeout } from './placement';
import { searchListings, type SearchInput } from './search';

let t: TestDb;
const DAY = 86_400_000;
const NOW = new Date();

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.listing_dispositions`);
  await t.db.execute(sql`delete from app.discovery_listings`);
});

afterEach(() => {
  setPlacementHookForTests(null);
  resetSeekerOverlayForTests();
  vi.restoreAllMocks();
});

const seed = (rows: Partial<ProjectionRowInput>[]) => insertProjectionRows(t.db, rows, NOW);

/** `n` seasonal listings, newest first in the default sort. */
const seedOrganic = (n: number) =>
  seed(
    Array.from({ length: n }, (_, k) => ({
      title: `Lift operator ${k}`,
      publishedAt: new Date(NOW.getTime() - (k + 1) * DAY),
    })),
  );

const search = (over: Partial<SearchInput> = {}) =>
  searchListings(t.db, {
    query: { categories: ['seasonal'] },
    sort: 'newest',
    surface: 'seek',
    tz: 'UTC',
    viewerUserId: null,
    viewerKey: 'viewer-key',
    limit: 20,
    ...over,
  });

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

describe('searchListings with a placement hook', () => {
  it('puts the boosted slot first, carries the hook state and resumes after organicConsumed', async () => {
    const organic = await seedOrganic(45);
    const [boosted] = (await seed([{ title: 'Orchard hand', category: 'farm' }])) as [string];
    const calls: PlacementInput[] = [];
    setPlacementHookForTests({
      ...noopHook,
      async place(_db, i) {
        calls.push(i);
        return {
          items: [
            { listingId: boosted, boostId: 'b1' },
            ...i.organic.slice(0, 19).map((listingId) => ({ listingId, boostId: null })),
          ],
          organicConsumed: 19,
          state: 'S1',
        };
      },
    });

    const page1 = await search();
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0]).toMatchObject({ listingId: boosted, boosted: { boostId: 'b1' } });
    expect(page1.items[0]?.href.endsWith('source=boost')).toBe(true);
    expect(page1.items[1]?.href.endsWith('source=seek')).toBe(true);
    expect(page1.items.slice(1).map((c) => c.listingId)).toEqual(organic.slice(0, 19));
    const cursor = decodeCursor(
      page1.nextCursor ?? '',
      cursorHash({ categories: ['seasonal'] }, 'newest'),
    );
    expect(cursor).toMatchObject({ ps: 'S1', pi: 0 });
    expect(calls[0]).toMatchObject({
      surface: 'seek',
      pageIndex: 0,
      pageSize: 20,
      state: null,
      viewerKey: 'viewer-key',
    });

    const page2 = await search({ cursor: page1.nextCursor ?? undefined });
    expect(calls[1]).toMatchObject({ state: 'S1', pageIndex: 1 });
    expect(calls[1]?.organic[0]).toBe(organic[19]);
    expect(page2.items[1]?.listingId).toBe(organic[19]);
  });

  it('deduplicates the items by listing', async () => {
    const organic = await seedOrganic(3);
    setPlacementHookForTests({
      ...noopHook,
      async place(_db, i) {
        return {
          items: [
            { listingId: organic[2] ?? '', boostId: 'b2' },
            ...i.organic.map((listingId) => ({ listingId, boostId: null })),
          ],
          organicConsumed: i.organic.length,
          state: null,
        };
      },
    });
    const page = await search();
    expect(page.items.map((c) => c.listingId)).toEqual([organic[2], organic[0], organic[1]]);
    expect(page.items[0]?.boosted).toEqual({ boostId: 'b2' });
  });

  it('binds matchIds to the query, the viewer and the surface', async () => {
    const [farmB, maritimeB, skippedB, savedB, appliedB] = (await seed([
      { category: 'farm', title: 'Farm' },
      { category: 'maritime', title: 'Maritime' },
      { category: 'farm', title: 'Skipped' },
      { category: 'farm', title: 'Saved' },
      { category: 'farm', title: 'Applied' },
    ])) as [string, string, string, string, string];
    const user = await seeker();
    await dispose(user, skippedB, 'skipped');
    await dispose(user, savedB, 'saved');
    registerSeekerOverlay({
      appliedListingIds: async (_db, _u, ids) =>
        new Set(ids === 'all' ? [appliedB] : ids.filter((x) => x === appliedB)),
      hiddenOrgIds: async () => [],
    });
    const matched: string[][] = [];
    setPlacementHookForTests({
      ...noopHook,
      async place(db, i) {
        matched.push(await i.matchIds([farmB, maritimeB, skippedB, savedB, appliedB]));
        return noopHook.place(db, i);
      },
    });
    const query = { categories: ['farm' as const] };
    await search({ query, viewerUserId: user });
    await search({ query, viewerUserId: user, surface: 'swipe' });
    expect(matched).toEqual([[farmB, savedB, appliedB], [farmB]]);
  });

  it('never calls the hook for the Map list', async () => {
    await seedOrganic(2);
    const place = vi.fn(noopHook.place);
    setPlacementHookForTests({ ...noopHook, place });
    expect((await search({ surface: 'map_list' })).items).toHaveLength(2);
    expect(place).not.toHaveBeenCalled();
  });

  it('labels boostedAmong matches on Seek and on the deck', async () => {
    const [o1, o2] = (await seedOrganic(2)) as [string, string];
    setPlacementHookForTests({ ...noopHook, boostedAmong: async () => new Map([[o2, 'b9']]) });
    for (const surface of ['seek', 'swipe'] as const) {
      const byId = new Map((await search({ surface })).items.map((c) => [c.listingId, c]));
      expect(byId.get(o2)?.boosted).toEqual({ boostId: 'b9' });
      expect(byId.get(o1)?.boosted).toBeNull();
      expect(byId.get(o2)?.href.endsWith(`source=${surface}`)).toBe(true);
    }
  });
});

describe('placeWithTimeout', () => {
  const input = (organic: string[]): PlacementInput => ({
    surface: 'seek',
    pageIndex: 0,
    pageSize: organic.length,
    organic,
    matchIds: async (ids) => ids,
    viewerKey: 'k',
    state: 'S0',
    now: NOW,
  });
  const organicOut = (organic: string[]) => ({
    items: organic.map((listingId) => ({ listingId, boostId: null })),
    organicConsumed: organic.length,
    state: 'S0',
  });

  it('returns the organic page within 150 ms when the hook sleeps 200 ms, and logs a warning', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const sleepy: BoostPlacementHook = {
      ...noopHook,
      place: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ items: [], organicConsumed: 0, state: 'late' }), 200),
        ),
    };
    const started = Date.now();
    const out = await placeWithTimeout(t.db, sleepy, input(['a', 'b']));
    expect(Date.now() - started).toBeLessThan(150);
    expect(out).toEqual(organicOut(['a', 'b']));
    expect(warn).toHaveBeenCalledWith('discovery.placement_failed', expect.anything());
  });

  it('returns the organic page when the hook throws or returns nonsense', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const throwing: BoostPlacementHook = {
      ...noopHook,
      place: async () => {
        throw new Error('boom');
      },
    };
    expect(await placeWithTimeout(t.db, throwing, input(['a']))).toEqual(organicOut(['a']));
    const nonsense = {
      ...noopHook,
      place: async () => ({ items: [], organicConsumed: 7, state: null }),
    };
    expect(await placeWithTimeout(t.db, nonsense, input(['a']))).toEqual(organicOut(['a']));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('passes a hook that answers in time straight through', async () => {
    const out = {
      items: [
        { listingId: 'x', boostId: 'b' },
        { listingId: 'a', boostId: null },
      ],
      organicConsumed: 1,
      state: 'S1',
    };
    const hook = { ...noopHook, place: async () => out };
    expect(await placeWithTimeout(t.db, hook, input(['a', 'b']))).toEqual(out);
  });

  it('organic pages through a throwing hook in the search itself', async () => {
    const organic = await seedOrganic(3);
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    setPlacementHookForTests({
      ...noopHook,
      place: async () => {
        throw new Error('boom');
      },
    });
    expect((await search()).items.map((c) => c.listingId)).toEqual(organic);
  });
});
