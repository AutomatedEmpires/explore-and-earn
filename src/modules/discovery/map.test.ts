// Map pins, server clusters and the location preview (SP3 spec 8.6, plan Task 20): one pin per
// location with its winning category, Remote-only pins, the bbox (across the antimeridian too),
// clusters above 2,000 locations, the preview's counts and Remote line, and boosted labels.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import {
  noopHook,
  registerSeekerOverlay,
  resetSeekerOverlayForTests,
  setPlacementHookForTests,
} from './hooks';
import { clusterCellDegrees, locationPreview, mapPins, MAX_PINS } from './map';
import type { ProjectionRowInput } from './projection-columns';

let t: TestDb;
const NOW = new Date();
const US: [number, number, number, number] = [-180, -60, 180, 72];

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

const pins = (over: Partial<Parameters<typeof mapPins>[1]> = {}) =>
  mapPins(t.db, { query: {}, bbox: US, zoom: 4, viewerUserId: null, ...over });

const preview = (locationId: string, over: Partial<Parameters<typeof locationPreview>[1]> = {}) =>
  locationPreview(t.db, { locationId, query: {}, tz: 'UTC', viewerUserId: null, ...over });

/** A location in Seward, AK. */
const seward = (locationId: string): Partial<ProjectionRowInput> => ({
  locationId,
  state: 'AK',
  city: 'Seward',
  lat: 60.1,
  lng: -149.44,
});

describe('mapPins', () => {
  it('gives one pin per location with the category most of its matches have', async () => {
    const l1 = newId();
    await seed([
      { ...seward(l1), category: 'maritime', title: 'Deckhand' },
      { ...seward(l1), category: 'maritime', title: 'Skiff operator' },
      { ...seward(l1), category: 'farm', title: 'Gardener' },
    ]);
    const out = await pins();
    expect(out).toMatchObject({ capped: false, clusters: [] });
    expect(out.pins).toEqual([
      {
        kind: 'pin',
        locationId: l1,
        orgId: expect.any(String),
        lat: expect.closeTo(60.1, 5),
        lng: expect.closeTo(-149.44, 5),
        category: 'maritime',
        categories: ['maritime', 'farm'],
        remoteOnly: false,
        matchingCount: 3,
        boosted: false,
      },
    ]);
  });

  it('breaks a tie in the pin category order and flags Remote-only locations', async () => {
    const tie = newId();
    const remote = newId();
    await seed([
      { locationId: tie, category: 'farm' },
      { locationId: tie, category: 'seasonal' },
      { locationId: remote, category: 'remote', remote: true, lat: 45, lng: -100 },
    ]);
    const byLocation = new Map((await pins()).pins.map((p) => [p.locationId, p]));
    expect(byLocation.get(tie)).toMatchObject({ category: 'seasonal', remoteOnly: false });
    expect(byLocation.get(remote)).toMatchObject({ category: 'remote', remoteOnly: true });
  });

  it('counts only active matches for this viewer and query', async () => {
    const l1 = newId();
    await seed([
      { locationId: l1, category: 'farm' },
      { locationId: l1, category: 'seasonal' },
      { locationId: l1, category: 'farm', isActive: false, closedAt: NOW },
    ]);
    expect((await pins()).pins[0]?.matchingCount).toBe(2);
    expect((await pins({ query: { categories: ['farm'] } })).pins[0]).toMatchObject({
      matchingCount: 1,
      category: 'farm',
      categories: ['farm'],
    });
    expect((await pins({ query: { categories: ['maritime'] } })).pins).toEqual([]);
  });

  it('keeps the pins inside the bbox', async () => {
    const co = newId();
    await seed([
      { locationId: co, lat: 39.48, lng: -106.04 },
      { ...seward(newId()) },
      { state: 'AK', lat: 64.84, lng: -147.72, locationId: newId() },
    ]);
    const out = await pins({ bbox: [-109.1, 36.9, -102, 41.1] });
    expect(out.pins.map((p) => p.locationId)).toEqual([co]);
  });

  it('shows pins on both sides of the antimeridian (Review Focus 5)', async () => {
    const west = newId();
    const east = newId();
    await seed([
      { locationId: west, state: 'AK', lat: 52, lng: 175 },
      { locationId: east, state: 'AK', lat: 61, lng: -150 },
      { locationId: newId(), state: 'ND', lat: 60, lng: -100 },
    ]);
    const out = await pins({ bbox: [170, 50, -130, 72] });
    expect(new Set(out.pins.map((p) => p.locationId))).toEqual(new Set([west, east]));
  });

  it('returns grid clusters above 2,000 locations', async () => {
    const [template] = (await seed([{ lat: 39, lng: -105 }])) as [string];
    const [row] = await queryRows<{ cols: string }>(
      t.db,
      sql`select string_agg(column_name, ', ' order by ordinal_position) as cols
        from information_schema.columns
        where table_schema = 'app' and table_name = 'discovery_listings'`,
    );
    const cols = (row?.cols ?? '').split(', ');
    const values = cols.map((c) =>
      c === 'listing_id' || c === 'location_id'
        ? 'gen_random_uuid()'
        : c === 'geog'
          ? `ST_SetSRID(ST_MakePoint(-105 + g * 0.01, 39 + (g % 50) * 0.01), 4326)::geography`
          : `d.${c}`,
    );
    await t.db.execute(sql`
      insert into app.discovery_listings (${sql.raw(cols.join(', '))})
      select ${sql.raw(values.join(', '))}
      from app.discovery_listings d, generate_series(1, ${MAX_PINS}::int) g
      where d.listing_id = ${template}::uuid`);

    const out = await pins({ zoom: 6 });
    expect(out.capped).toBe(true);
    expect(out.pins).toEqual([]);
    expect(out.clusters.length).toBeGreaterThan(0);
    expect(out.clusters.every((c) => c.kind === 'cluster')).toBe(true);
    expect(out.clusters.reduce((n, c) => n + c.listings, 0)).toBe(MAX_PINS + 1);
    expect(out.clusters.reduce((n, c) => n + c.locations, 0)).toBe(MAX_PINS + 1);
  });

  it('sizes the cluster cells by zoom', () => {
    expect(clusterCellDegrees(0)).toBe(90);
    expect(clusterCellDegrees(4)).toBe(360 / 64);
  });

  it('flags a pin boosted when boostedAmong covers one of its matches', async () => {
    const l1 = newId();
    const l2 = newId();
    const [a] = (await seed([
      { locationId: l1 },
      { locationId: l1 },
      { locationId: l2, lat: 45, lng: -100 },
    ])) as [string];
    setPlacementHookForTests({
      ...noopHook,
      boostedAmong: async (_db, ids) =>
        new Map(ids.filter((id) => id === a).map((id) => [id, 'b1'])),
    });
    const byLocation = new Map((await pins()).pins.map((p) => [p.locationId, p.boosted]));
    expect(byLocation).toEqual(
      new Map([
        [l1, true],
        [l2, false],
      ]),
    );
  });
});

describe('locationPreview', () => {
  it('describes the host there with the active and matching counts', async () => {
    const loc = newId();
    const [farm] = await seed([
      {
        ...seward(loc),
        category: 'farm',
        title: 'Gardener',
        approximate: true,
        hostName: 'Resurrection Bay Farm',
      },
      {
        ...seward(loc),
        category: 'maritime',
        title: 'Deckhand',
        approximate: true,
        hostName: 'Resurrection Bay Farm',
      },
      {
        ...seward(loc),
        category: 'maritime',
        title: 'Skiff operator',
        approximate: true,
        hostName: 'Resurrection Bay Farm',
      },
    ]);
    const all = await preview(loc);
    expect(all?.host).toEqual({
      orgId: expect.any(String),
      name: 'Resurrection Bay Farm',
      slug: 'resurrection-bay-farm',
      logoUrl: null,
      locationLabel: 'Seward, AK',
      approximate: true,
      categories: ['maritime', 'farm'],
      remoteLine: null,
    });
    expect(all).toMatchObject({ activeCount: 3, matchingCount: 3, nextCursor: null });
    expect(all?.items).toHaveLength(3);

    const farmOnly = await preview(loc, { query: { categories: ['farm'] } });
    expect(farmOnly).toMatchObject({ activeCount: 3, matchingCount: 1 });
    expect(farmOnly?.items.map((c) => c.listingId)).toEqual([farm]);
    expect(farmOnly?.items[0]?.href.endsWith('source=map')).toBe(true);
  });

  it('pages the matches in 20s', async () => {
    const loc = newId();
    await seed(Array.from({ length: 23 }, () => ({ locationId: loc })));
    const first = await preview(loc);
    expect(first?.items).toHaveLength(20);
    const second = await preview(loc, { cursor: first?.nextCursor ?? undefined });
    expect(second?.items).toHaveLength(3);
    expect(second?.nextCursor).toBeNull();
  });

  it('reads the Remote line with up to 5 states, then "+N more"', async () => {
    const loc = newId();
    await seed([
      {
        ...seward(loc),
        category: 'remote',
        remote: true,
        remoteStates: ['CO', 'UT', 'WA', 'OR', 'ID', 'MT', 'NV'],
      },
      { ...seward(loc) },
    ]);
    expect((await preview(loc))?.host.remoteLine).toBe(
      'Remote · host based in Seward, AK · work from: CO, ID, MT, NV, OR +2 more',
    );
    const us = newId();
    await seed([{ ...seward(us), category: 'remote', remote: true, remoteStates: ['US'] }]);
    expect((await preview(us))?.host.remoteLine).toBe(
      'Remote · host based in Seward, AK · work from: US',
    );
  });

  it('drops a hidden or blocked host, and is null when that removes every row', async () => {
    const loc = newId();
    const only = newId();
    const blocked = newId();
    const visible = newId();
    const seeker = newId();
    const newer = new Date(NOW.getTime() + 60_000);
    await seed([
      {
        ...seward(only),
        orgId: blocked,
        hostName: 'Blocked Harbor',
        title: 'Hidden only',
      },
    ]);
    registerSeekerOverlay({
      appliedListingIds: async () => new Set(),
      hiddenOrgIds: async () => [blocked],
    });
    expect(await preview(only, { viewerUserId: seeker })).toBeNull();
    expect((await preview(only))?.host.name).toBe('Blocked Harbor');

    await seed([
      {
        ...seward(loc),
        orgId: blocked,
        hostName: 'Blocked Harbor',
        hostSlug: 'blocked-harbor',
        title: 'Hidden job',
        indexedAt: newer,
      },
      {
        ...seward(loc),
        orgId: visible,
        hostName: 'Open Harbor',
        hostSlug: 'open-harbor',
        title: 'Open job',
        indexedAt: NOW,
      },
    ]);
    const hidden = await preview(loc, { viewerUserId: seeker });
    expect(hidden?.host).toMatchObject({ name: 'Open Harbor', slug: 'open-harbor', orgId: visible });
    expect(hidden).toMatchObject({ activeCount: 1, matchingCount: 1 });
    expect(hidden?.items.map((c) => c.listingId)).toHaveLength(1);
    expect(hidden?.items[0]?.title).toBe('Open job');
    expect((await preview(loc))?.activeCount).toBe(2);
  });

  it('is null for a location with no active listing', async () => {
    const closed = newId();
    await seed([{ locationId: closed, isActive: false, closedAt: NOW }]);
    expect(await preview(closed)).toBeNull();
    expect(await preview(newId())).toBeNull();
    expect(await preview('not-a-uuid')).toBeNull();
  });

  it('labels a boosted match in the preview', async () => {
    const loc = newId();
    const [a, b] = (await seed([{ locationId: loc }, { locationId: loc }])) as [string, string];
    setPlacementHookForTests({ ...noopHook, boostedAmong: async () => new Map([[a, 'b7']]) });
    const byId = new Map((await preview(loc))?.items.map((c) => [c.listingId, c.boosted]));
    expect(byId.get(a)).toEqual({ boostId: 'b7' });
    expect(byId.get(b)).toBeNull();
  });
});
