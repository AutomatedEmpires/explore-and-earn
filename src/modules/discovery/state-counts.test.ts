// Browse by State counts (FD-8 addendum, plan Task 49): one live count per US_STATES code, equal
// to the total Seek shows for that state (Remote listings open to it or to the whole US
// included, closed ones not), capped like Seek's total.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { DEFAULT_LOCATION_ID } from '../../../tests/fakes/listing-content';
import { fakeSp2 } from '../../../tests/fakes/sp2';
import { mediaFake } from '../../../tests/fakes/media';
import { queryRows } from '@/lib/db';
import { US_STATES } from '@/lib/discovery';
import { newId } from '@/lib/ids';
import { noopHook, setPlacementHookForTests } from './hooks';
import { searchListings } from './search';
import { countListingsByState } from './state-counts';
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
const TZ = 'America/Chicago';

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

const remote = (states: ('CO' | 'UT')[] | 'all_us') =>
  fakeSp2.putListing({
    content: {
      basics: { primaryCategory: 'remote', title: 'Support agent' },
      where: {
        mode: 'remote',
        scope: states === 'all_us' ? 'all_us' : 'states',
        states: states === 'all_us' ? [] : states,
        hostLocationId: DEFAULT_LOCATION_ID,
      },
    },
  }).listingId;

describe('countListingsByState', () => {
  it('matches the Seek total for every state (FD-8)', async () => {
    const wy = fakeSp2.putLocation({
      id: newId(),
      city: 'Jackson',
      state: 'WY',
      publicPoint: { lat: 43.48, lng: -110.76 },
    }).id;
    const ids = [
      fakeSp2.putListing().listingId,
      fakeSp2.putListing().listingId,
      fakeSp2.putListing().listingId,
      remote(['CO', 'UT']),
      remote('all_us'),
    ];
    const closed = fakeSp2.putListing({
      content: { where: { mode: 'onsite', locationId: wy } },
    }).listingId;
    for (const id of [...ids, closed]) await sync(id);
    fakeSp2.setListingState(closed, 'closed');
    await sync(closed);

    const counts = await countListingsByState(t.db, { tz: TZ });
    expect(counts.map((c) => c.code)).toEqual(US_STATES.map((s) => s.code));
    const byCode = new Map(counts.map((c) => [c.code, c]));
    expect(byCode.get('CO')).toEqual({ code: 'CO', count: 5, capped: false });
    expect(byCode.get('UT')).toEqual({ code: 'UT', count: 2, capped: false });
    expect(byCode.get('WY')).toEqual({ code: 'WY', count: 1, capped: false });
    expect(byCode.get('VT')).toEqual({ code: 'VT', count: 1, capped: false });

    for (const s of US_STATES) {
      const seek = await searchListings(t.db, {
        query: { states: [s.code] },
        sort: 'relevant',
        surface: 'seek',
        tz: TZ,
        viewerUserId: null,
        viewerKey: 'guest',
        limit: 1,
      });
      expect(byCode.get(s.code)?.count, s.code).toBe(seek.total);
    }
  });

  it('reads 0 everywhere when nothing is active', async () => {
    await insertProjectionRows(t.db, [{ isActive: false, closedAt: new Date() }]);
    const counts = await countListingsByState(t.db, { tz: TZ });
    expect(counts).toHaveLength(56);
    expect(counts.every((c) => c.count === 0 && !c.capped)).toBe(true);
  });

  it('counts a Remote listing once even when its states repeat or include US', async () => {
    await insertProjectionRows(t.db, [
      { remote: true, category: 'remote', remoteStates: ['CO', 'CO'] },
      { remote: true, category: 'remote', remoteStates: ['US', 'UT'] },
    ]);
    const byCode = new Map(
      (await countListingsByState(t.db, { tz: TZ })).map((c) => [c.code, c.count]),
    );
    expect(byCode.get('CO')).toBe(2);
    expect(byCode.get('UT')).toBe(1);
    expect(byCode.get('AK')).toBe(1);
  });

  it('caps a state at 10,000, like the Seek total', async () => {
    const [template] = (await insertProjectionRows(t.db, [{ state: 'TX' }])) as [string];
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
      from app.discovery_listings d, generate_series(1, 10000) g
      where d.listing_id = ${template}::uuid`);
    const byCode = new Map((await countListingsByState(t.db, { tz: TZ })).map((c) => [c.code, c]));
    expect(byCode.get('TX')).toEqual({ code: 'TX', count: 10_000, capped: true });
    expect(byCode.get('CO')).toEqual({ code: 'CO', count: 0, capped: false });
  });

  it('falls back to Chicago for an unknown zone', async () => {
    expect(await countListingsByState(t.db, { tz: 'Etc/Unknown' })).toHaveLength(56);
  });
});
