// Landing's read of the projection (SP3 W8, plan Tasks 40–42): an uncapped keyset of active
// listings ordered by listing_id, and the grouped coverage the landing sitemap counts.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { landingCoverage, listActiveListings } from './feed';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.discovery_listings`);
});

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

const id = (n: number) =>
  `019a4a3c-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

describe('listActiveListings', () => {
  it('pages active listings by listing_id with slug and indexed_at, and skips closed rows', async () => {
    await insertProjectionRows(t.db, [
      { listingId: id(1), slug: 'alpha', title: 'Alpha', indexedAt: at('2026-06-01') },
      {
        listingId: id(2),
        slug: 'closed',
        title: 'Closed',
        indexedAt: at('2026-06-02'),
        isActive: false,
        closedAt: at('2026-06-03'),
      },
      { listingId: id(3), slug: 'beta', title: 'Beta', indexedAt: at('2026-06-04') },
    ]);

    const first = await listActiveListings(t.db, { limit: 1 });
    expect(first.items).toEqual([
      { listingId: id(1), slug: 'alpha', indexedAt: at('2026-06-01') },
    ]);
    expect(first.next).toBe(id(1));

    const second = await listActiveListings(t.db, { limit: 10, after: first.next ?? undefined });
    expect(second.items).toEqual([
      { listingId: id(3), slug: 'beta', indexedAt: at('2026-06-04') },
    ]);
    expect(second.next).toBeNull();
  });

  it('does not stop at the search page cap', async () => {
    await insertProjectionRows(
      t.db,
      Array.from({ length: 51 }, (_, index) => ({
        listingId: id(index + 1),
        title: `Row ${index + 1}`,
        indexedAt: at('2026-06-01'),
      })),
    );

    const page = await listActiveListings(t.db, { limit: 51 });
    expect(page.items).toHaveLength(51);
    expect(page.items.map((item) => item.listingId)).toEqual(
      Array.from({ length: 51 }, (_, index) => id(index + 1)),
    );
    expect(page.next).toBeNull();
  });
});

describe('landingCoverage', () => {
  it('groups active listings and leaves closed ones out', async () => {
    await insertProjectionRows(t.db, [
      {
        state: 'CO',
        category: 'seasonal',
        genre: 'ski-resorts',
        destinationSlug: 'yellowstone',
        indexedAt: at('2026-06-01'),
        title: 'Early Colorado',
        season: 'summer',
        seasonYear: 2026,
        startOn: '2026-07-01',
      },
      {
        state: 'CO',
        category: 'seasonal',
        genre: 'ski-resorts',
        indexedAt: at('2026-06-08'),
        title: 'Later Colorado',
        startOn: '2026-01-15',
      },
      {
        state: 'AK',
        category: 'maritime',
        genre: 'yachts',
        indexedAt: at('2026-06-02'),
        title: 'Deckhand',
        startOn: '2026-01-15',
      },
      {
        state: 'TX',
        remote: true,
        remoteStates: ['UT'],
        category: 'remote',
        genre: null,
        indexedAt: at('2026-06-03'),
        title: 'Remote Utah',
        startOn: '2026-01-15',
      },
      {
        state: 'TX',
        remote: true,
        remoteStates: ['US'],
        category: 'remote',
        genre: null,
        indexedAt: at('2026-06-04'),
        title: 'Remote anywhere',
        startOn: '2026-01-15',
      },
      {
        state: 'WA',
        category: 'farm',
        genre: null,
        sponsorsVisas: true,
        indexedAt: at('2026-06-05'),
        title: 'Visa farm',
        startOn: '2026-01-15',
      },
      {
        state: 'OR',
        category: 'seasonal',
        genre: null,
        scheduleKind: 'ongoing',
        indexedAt: at('2026-06-06'),
        title: 'Year round',
        startOn: '2026-01-15',
      },
      {
        state: 'WY',
        category: 'farm',
        genre: null,
        isActive: false,
        closedAt: at('2026-06-07'),
        indexedAt: at('2026-06-09'),
        title: 'Closed Wyoming',
      },
    ]);

    const coverage = await landingCoverage(t.db, {
      seasons: [
        { season: 'spring', year: 2026 },
        { season: 'summer', year: 2026 },
        { season: 'fall', year: 2026 },
        { season: 'winter', year: 2026 },
        { season: 'year_round', year: 2026 },
      ],
    });

    expect(coverage.onSiteStates).toEqual(
      expect.arrayContaining([
        { code: 'AK', indexedAt: at('2026-06-02') },
        { code: 'CO', indexedAt: at('2026-06-08') },
        { code: 'WA', indexedAt: at('2026-06-05') },
        { code: 'OR', indexedAt: at('2026-06-06') },
      ]),
    );
    expect(coverage.onSiteStates.map((row) => row.code)).not.toContain('WY');
    expect(coverage.onSiteStates.map((row) => row.code)).not.toContain('TX');
    expect(coverage.remoteStates).toEqual([{ code: 'UT', indexedAt: at('2026-06-03') }]);
    expect(coverage.remoteAnywhereAt).toEqual(at('2026-06-04'));
    expect(coverage.categories).toEqual(
      expect.arrayContaining([
        { category: 'seasonal', indexedAt: at('2026-06-08') },
        { category: 'maritime', indexedAt: at('2026-06-02') },
        { category: 'remote', indexedAt: at('2026-06-04') },
        { category: 'farm', indexedAt: at('2026-06-05') },
      ]),
    );
    expect(coverage.categoryStates).toEqual(
      expect.arrayContaining([
        { category: 'seasonal', code: 'CO', indexedAt: at('2026-06-08') },
        { category: 'maritime', code: 'AK', indexedAt: at('2026-06-02') },
        { category: 'remote', code: 'UT', indexedAt: at('2026-06-03') },
        { category: 'farm', code: 'WA', indexedAt: at('2026-06-05') },
      ]),
    );
    expect(coverage.remoteCategoryAnywhere).toEqual([
      { category: 'remote', indexedAt: at('2026-06-04') },
    ]);
    expect(coverage.genres).toEqual(
      expect.arrayContaining([
        { slug: 'ski-resorts', category: 'seasonal', indexedAt: at('2026-06-08') },
        { slug: 'yachts', category: 'maritime', indexedAt: at('2026-06-02') },
      ]),
    );
    expect(coverage.seasons).toEqual([
      { season: 'spring', indexedAt: null },
      { season: 'summer', indexedAt: at('2026-06-01') },
      { season: 'fall', indexedAt: null },
      { season: 'winter', indexedAt: null },
      { season: 'year_round', indexedAt: at('2026-06-06') },
    ]);
    expect(coverage.destinations).toEqual([
      { slug: 'yellowstone', indexedAt: at('2026-06-01') },
    ]);
    expect(coverage.internationalAt).toEqual(at('2026-06-05'));
  });
});
