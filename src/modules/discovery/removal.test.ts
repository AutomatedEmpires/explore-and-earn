// A removed or closed listing is gone from every surface (Review Focus 1, spec failure mode 1;
// plan Task 21): Seek, the deck, the Map list, the pins, the location preview and getJobCards
// each run their own SQL, so each is checked after syncListing sees the change. The detail
// page reads SP2, so even a stale row never shows a removed listing.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { fakeSp2 } from '../../../tests/fakes/sp2';
import { mediaFake } from '../../../tests/fakes/media';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { getListingDetail } from './detail';
import { noopHook, setPlacementHookForTests } from './hooks';
import { locationPreview, mapPins } from './map';
import { getJobCards, searchListings, type SearchInput } from './search';
import { syncListing } from './sync';

vi.mock('@/modules/listings', async () => (await import('../../../tests/fakes/sp2')).listingsFake);
vi.mock(
  '@/modules/hostpages',
  async () => (await import('../../../tests/fakes/sp2')).hostpagesFake,
);
vi.mock(
  '@/modules/locations',
  async () => (await import('../../../tests/fakes/sp2')).locationsFake,
);
vi.mock('@/modules/media', async (orig) => ({
  ...(await orig<typeof import('@/modules/media')>()),
  ...(await import('../../../tests/fakes/media')).mediaFake,
}));

let t: TestDb;
const L2 = newId();

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  fakeSp2.reset();
  mediaFake.reset();
  await t.db.execute(sql`delete from app.listing_dispositions`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  setPlacementHookForTests(noopHook);
});

afterEach(() => {
  setPlacementHookForTests(null);
});

const sync = (id: string) => syncListing(t.db, id, new Date());

describe('removal across surfaces', () => {
  it('drops a removed or closed listing from every surface', async () => {
    const l1 = fakeSp2.putLocation({
      id: newId(),
      city: 'Seward',
      state: 'AK',
      publicPoint: { lat: 60.1, lng: -149.44 },
    }).id;
    fakeSp2.putLocation({
      id: L2,
      city: 'Homer',
      state: 'AK',
      publicPoint: { lat: 59.64, lng: -151.55 },
    });
    const at = (locationId: string, title: string) =>
      fakeSp2.putListing({ content: { basics: { title }, where: { mode: 'onsite', locationId } } })
        .listingId;
    const a = at(l1, 'Deckhand');
    const b = at(l1, 'Skiff operator');
    const c = at(L2, 'Processor');
    for (const id of [a, b, c]) await sync(id);

    const seeker = newId();
    await t.db.execute(sql`
      insert into app.users (id, clerk_user_id, account_type, adult_attested_at)
      values (${seeker}, ${`user_${seeker}`}, 'seeker', now())`);
    await t.db.execute(sql`
      insert into app.listing_dispositions (user_id, listing_id, state, source, first_saved_at, acted_at)
      values (${seeker}, ${b}, 'saved', 'seek', now(), now())`);

    const surfaces = async () => {
      const out: Record<string, string[]> = {};
      for (const surface of ['seek', 'swipe', 'map_list'] as SearchInput['surface'][]) {
        const page = await searchListings(t.db, {
          query: {},
          sort: 'relevant',
          surface,
          tz: 'UTC',
          viewerUserId: seeker,
          viewerKey: seeker,
          limit: 50,
        });
        out[surface] = page.items.map((x) => x.listingId);
      }
      return out;
    };
    const pinCounts = async () =>
      new Map(
        (
          await mapPins(t.db, {
            query: {},
            bbox: [-180, -60, 180, 72],
            zoom: 4,
            viewerUserId: seeker,
          })
        ).pins.map((p) => [p.locationId, p.matchingCount]),
      );
    const preview = (locationId: string) =>
      locationPreview(t.db, { locationId, query: {}, tz: 'UTC', viewerUserId: seeker });

    // Before: everything is visible (B is saved, so the deck leaves it out).
    const before = await surfaces();
    for (const s of ['seek', 'swipe', 'map_list'])
      expect(before[s]).toEqual(expect.arrayContaining([a, c]));
    expect(await pinCounts()).toEqual(
      new Map([
        [l1, 2],
        [L2, 1],
      ]),
    );
    expect((await preview(l1))?.activeCount).toBe(2);

    // A is removed.
    fakeSp2.setListingState(a, 'removed');
    await sync(a);
    const afterA = await surfaces();
    for (const s of ['seek', 'swipe', 'map_list']) expect(afterA[s]).not.toContain(a);
    expect(await pinCounts()).toEqual(
      new Map([
        [l1, 1],
        [L2, 1],
      ]),
    );
    const p1 = await preview(l1);
    expect(p1?.activeCount).toBe(1);
    expect(p1?.items.map((x) => x.listingId)).toEqual([b]);
    expect((await getJobCards(t.db, [a, b])).map((x) => x.listingId)).toEqual([b]);

    // C, alone at L2, closes.
    fakeSp2.setListingState(c, 'closed');
    await sync(c);
    const afterC = await surfaces();
    for (const s of ['seek', 'swipe', 'map_list']) expect(afterC[s]).not.toContain(c);
    expect((await pinCounts()).has(L2)).toBe(false);
    expect(await preview(L2)).toBeNull();
    expect(await getJobCards(t.db, [c])).toEqual([]);
  });

  it('never shows a removed listing on its detail page, even with a stale row', async () => {
    const l = fakeSp2.putListing().listingId;
    await sync(l);
    fakeSp2.setListingState(l, 'removed');
    // No sync: the row still reads active.
    const [row] = await queryRows<{ active: boolean }>(
      t.db,
      sql`select is_active as active from app.discovery_listings where listing_id = ${l}`,
    );
    expect(row?.active).toBe(true);
    expect(
      await getListingDetail(t.db, { listingId: l, viewerUserId: null, tz: 'UTC' }),
    ).toBeNull();
  });
});
