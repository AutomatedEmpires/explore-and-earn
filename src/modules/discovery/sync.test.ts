// Projection sync (SP3 spec section 6, plan Tasks 8 and 9), against the SP2 and media fakes:
// each listing event, the Remote mapping, failed reads, the latest state winning, the host and
// location fan-out, the nightly drift check and the rebuild.
import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import {
  DEFAULT_COVER_MEDIA_ID,
  DEFAULT_LOCATION_ID,
  DEFAULT_ORG_ID,
} from '../../../tests/fakes/listing-content';
import { fakeSp2 } from '../../../tests/fakes/sp2';
import { mediaFake } from '../../../tests/fakes/media';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { PROJECTION_SELECT, type ProjectionRow } from './projection-columns';
import { driftCheck, rebuildSearchProjection, syncHandlers, syncHost, syncListing } from './sync';

const hoisted = vi.hoisted(() => ({
  raiseAlert: vi.fn(async () => {}),
  /** Media ids whose URLs are not public. */
  privateMedia: new Set<string>(),
}));

vi.mock('@/modules/listings', async () => (await import('../../../tests/fakes/sp2')).listingsFake);
vi.mock(
  '@/modules/hostpages',
  async () => (await import('../../../tests/fakes/sp2')).hostpagesFake,
);
vi.mock(
  '@/modules/locations',
  async () => (await import('../../../tests/fakes/sp2')).locationsFake,
);
vi.mock('@/modules/media', async (orig) => {
  const fake = (await import('../../../tests/fakes/media')).mediaFake;
  const { notFound: missing } = await import('@/lib/errors');
  return {
    ...(await orig<typeof import('@/modules/media')>()),
    ...fake,
    getMediaUrl: async (...a: Parameters<typeof fake.getMediaUrl>) => {
      if (hoisted.privateMedia.has(a[3])) throw missing('This file is not available');
      return fake.getMediaUrl(...a);
    },
  };
});
vi.mock('@/modules/trust', async (orig) => ({
  ...(await orig<typeof import('@/modules/trust')>()),
  raiseAlert: hoisted.raiseAlert,
}));

let t: TestDb;
const NOW = new Date('2026-06-01T12:00:00.000Z');
const LATER = new Date('2026-06-02T12:00:00.000Z');

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  fakeSp2.reset();
  mediaFake.reset();
  hoisted.raiseAlert.mockClear();
  hoisted.privateMedia.clear();
  await t.db.execute(sql`delete from app.saved_search_matches`);
  await t.db.execute(sql`delete from app.saved_searches`);
  await t.db.execute(sql`delete from app.listing_dispositions`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  await t.db.execute(sql`delete from app.outbox`);
});

async function rowOf(listingId: string): Promise<ProjectionRow | undefined> {
  const [row] = await queryRows<ProjectionRow>(
    t.db,
    sql`select ${PROJECTION_SELECT} from app.discovery_listings where listing_id = ${listingId}`,
  );
  return row;
}

async function count(query: SQL): Promise<number> {
  const [row] = await queryRows<{ n: number }>(t.db, query);
  return row?.n ?? -1;
}

const envelope = (event: string, data: Record<string, unknown>) => ({
  event,
  eventId: newId(),
  data,
});

const ctx = (now = NOW) => ({ db: t.db, now });

async function seedSeeker(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, account_type, adult_attested_at)
    values (${id}, ${`user_${id}`}, 'seeker', now())
  `);
  return id;
}

/** A saved disposition and an alert match for the listing, owned by `userId`. */
async function seedSeekerState(userId: string, listingId: string): Promise<void> {
  const searchId = newId();
  await t.db.execute(sql`
    insert into app.listing_dispositions (user_id, listing_id, state, source, first_saved_at, acted_at)
    values (${userId}, ${listingId}, 'saved', 'seek', now(), now())
  `);
  await t.db.execute(sql`
    insert into app.saved_searches (id, user_id, name, query, query_hash)
    values (${searchId}, ${userId}, 'Ski jobs', '{}'::jsonb, ${`hash-${searchId}`})
    on conflict do nothing
  `);
  await t.db.execute(sql`
    insert into app.saved_search_matches (saved_search_id, listing_id, matched_at)
    values (${searchId}, ${listingId}, now())
  `);
}

describe('syncListing', () => {
  it('projects a published listing (listing.published)', async () => {
    const l = fakeSp2.putListing();
    await syncHandlers['discovery.sync_listing']?.(
      envelope('listing.published', {
        listingId: l.listingId,
        revisionId: l.revisionId,
        orgId: l.orgId,
        first: true,
      }),
      ctx(),
    );

    const row = await rowOf(l.listingId);
    expect(row).toMatchObject({
      revisionId: l.revisionId,
      isActive: true,
      slug: 'lift-operator',
      title: 'Lift operator',
      occupationLabel: 'Lift operator',
      payHourlyMinCents: 1900,
      payHourlyMaxCents: 1900,
      payYearlyMinCents: 3952000,
      payChip: '$19/hr',
      payDetails: ['Paid every 2 weeks'],
      locationLabel: 'Breckenridge, CO',
      city: 'Breckenridge',
      state: 'CO',
      lat: 39.48,
      lng: -106.04,
      approximate: true,
      remote: false,
      remoteStates: [],
      genre: 'ski-resorts',
      category: 'seasonal',
      categories: ['seasonal'],
      hostName: 'Kettle Ridge Lodge',
      hostSlug: 'kettle-ridge-lodge',
      hostSince: '2026-11-03',
      scheduleKind: 'fixed',
      startOn: '2026-12-01',
      endOn: '2027-04-15',
      housingProvided: true,
      housingFree: false,
      housingCostLine: '$150/week · deducted from pay',
      housingNote: null,
      mealsProvided: false,
      mealsCostLine: null,
      sponsorsVisas: false,
      publishedAt: l.firstPublishedAt.toISOString(),
      firstActiveAt: NOW.toISOString(),
      indexedAt: NOW.toISOString(),
      closedAt: null,
    });
    expect(row?.cover?.src[640]).toBe(`https://media.test/${DEFAULT_COVER_MEDIA_ID}/640.webp`);
    expect(row?.cover?.alt).toBe(`Alt for ${DEFAULT_COVER_MEDIA_ID}`);
    expect(
      await count(sql`select count(*)::int as n from app.discovery_listings
        where listing_id = ${l.listingId} and search @@ to_tsquery('english', 'lift')`),
    ).toBe(1);
  });

  it('refreshes the row on listing.changed and keeps first_active_at', async () => {
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, NOW);
    const revisionId = newId();
    fakeSp2.putListing({
      listingId: l.listingId,
      revisionId,
      content: { basics: { title: 'Senior lift operator' } },
    });
    await syncHandlers['discovery.sync_listing']?.(
      envelope('listing.changed', { listingId: l.listingId, revisionId, orgId: l.orgId }),
      ctx(LATER),
    );

    expect(await rowOf(l.listingId)).toMatchObject({
      title: 'Senior lift operator',
      slug: 'senior-lift-operator',
      revisionId,
      firstActiveAt: NOW.toISOString(),
      indexedAt: LATER.toISOString(),
    });
  });

  it('keeps a closed listing as an inactive row', async () => {
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, NOW);
    fakeSp2.setListingState(l.listingId, 'closed');

    expect(await syncListing(t.db, l.listingId, NOW)).toBe('closed');
    expect(await rowOf(l.listingId)).toMatchObject({
      isActive: false,
      closedAt: NOW.toISOString(),
    });
    // A second close keeps the first closed_at.
    await syncListing(t.db, l.listingId, LATER);
    expect((await rowOf(l.listingId))?.closedAt).toBe(NOW.toISOString());
  });

  it("refreshes a closed row's host, so a lapsed subscription loses its badge", async () => {
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, NOW);
    fakeSp2.setListingState(l.listingId, 'closed');
    await syncListing(t.db, l.listingId, NOW);
    expect((await rowOf(l.listingId))?.hostSince).toBe('2026-11-03');

    const logo = newId();
    fakeSp2.putHost({
      orgId: DEFAULT_ORG_ID,
      name: 'Kettle Ridge Resort',
      subscriber: null,
      logoMediaId: logo,
    });
    await syncHandlers['discovery.sync_host']?.(
      envelope('subscription.changed', { orgId: DEFAULT_ORG_ID, status: 'canceled', plan: null }),
      ctx(LATER),
    );
    expect(await rowOf(l.listingId)).toMatchObject({
      isActive: false,
      closedAt: NOW.toISOString(),
      hostName: 'Kettle Ridge Resort',
      hostSince: null,
      hostLogoUrl: `https://media.test/${logo}/320.webp`,
    });
  });

  it('drops the badge of a closed row whose host is no longer public', async () => {
    const org = newId();
    const l = fakeSp2.putListing({ orgId: org });
    fakeSp2.setListingState(l.listingId, 'closed');
    await insertProjectionRows(t.db, [
      { listingId: l.listingId, orgId: org, hostSince: '2026-01-01', hostName: 'Gone Host' },
    ]);
    expect(await syncListing(t.db, l.listingId, NOW)).toBe('closed');
    expect(await rowOf(l.listingId)).toMatchObject({
      isActive: false,
      hostName: 'Gone Host',
      hostSince: null,
    });
  });

  it('leaves a closed listing absent when it was never projected', async () => {
    const l = fakeSp2.putListing();
    fakeSp2.setListingState(l.listingId, 'closed');
    expect(await syncListing(t.db, l.listingId, NOW)).toBe('closed');
    expect(await rowOf(l.listingId)).toBeUndefined();
  });

  it('reopens a closed row and clears closed_at', async () => {
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, NOW);
    fakeSp2.setListingState(l.listingId, 'closed');
    await syncListing(t.db, l.listingId, NOW);
    fakeSp2.setListingState(l.listingId, 'active');
    await syncListing(t.db, l.listingId, LATER);
    expect(await rowOf(l.listingId)).toMatchObject({
      isActive: true,
      closedAt: null,
      firstActiveAt: NOW.toISOString(),
    });
  });

  it('deletes a removed listing with its dispositions and alert matches (failure mode 1)', async () => {
    const seeker = await seedSeeker();
    const removed = fakeSp2.putListing();
    const other = fakeSp2.putListing();
    await syncListing(t.db, removed.listingId, NOW);
    await syncListing(t.db, other.listingId, NOW);
    await seedSeekerState(seeker, removed.listingId);
    await seedSeekerState(seeker, other.listingId);

    fakeSp2.setListingState(removed.listingId, 'removed');
    await syncHandlers['discovery.sync_listing']?.(
      envelope('listing.removed', { listingId: removed.listingId, orgId: removed.orgId }),
      ctx(),
    );

    expect(await rowOf(removed.listingId)).toBeUndefined();
    const left = (table: string, id: string) =>
      count(
        sql`select count(*)::int as n from ${sql.raw(`app.${table}`)} where listing_id = ${id}`,
      );
    expect(await left('listing_dispositions', removed.listingId)).toBe(0);
    expect(await left('saved_search_matches', removed.listingId)).toBe(0);
    expect(await left('listing_dispositions', other.listingId)).toBe(1);
    expect(await left('saved_search_matches', other.listingId)).toBe(1);
    expect(await rowOf(other.listingId)).toBeDefined();
  });

  it('deletes a row whose listing SP2 no longer knows', async () => {
    const [id] = await insertProjectionRows(t.db, [{}]);
    expect(await syncListing(t.db, id ?? '', NOW)).toBe('removed');
    expect(await rowOf(id ?? '')).toBeUndefined();
  });

  it('places a Remote all-US listing at the host location', async () => {
    fakeSp2.putLocation({
      id: DEFAULT_LOCATION_ID,
      publicPrecision: 'exact',
      publicPoint: { lat: 39.4817, lng: -106.0384 },
    });
    const l = fakeSp2.putListing({
      content: {
        basics: { primaryCategory: 'remote', title: 'Support agent' },
        where: {
          mode: 'remote',
          scope: 'all_us',
          states: [],
          hostLocationId: DEFAULT_LOCATION_ID,
        },
      },
    });
    await syncListing(t.db, l.listingId, NOW);

    expect(await rowOf(l.listingId)).toMatchObject({
      locationId: DEFAULT_LOCATION_ID,
      remote: true,
      remoteStates: ['US'],
      locationLabel: 'Remote · US',
      state: 'CO',
      lat: 39.4817,
      lng: -106.0384,
      approximate: false,
      category: 'remote',
      genre: 'customer-support',
    });
  });

  it('lists up to 5 Remote states, then counts the rest', async () => {
    const l = fakeSp2.putListing({
      content: {
        basics: { primaryCategory: 'remote' },
        where: {
          mode: 'remote',
          scope: 'states',
          states: ['AK', 'AZ', 'CA', 'CO', 'ID', 'MT', 'UT'],
          hostLocationId: DEFAULT_LOCATION_ID,
        },
      },
    });
    await syncListing(t.db, l.listingId, NOW);
    expect(await rowOf(l.listingId)).toMatchObject({
      remoteStates: ['AK', 'AZ', 'CA', 'CO', 'ID', 'MT', 'UT'],
      locationLabel: 'Remote · AK, AZ, CA, CO, ID +2 more',
    });
  });

  it('maps free amenities, notes, a secondary category, visas and the destination', async () => {
    const l = fakeSp2.putListing({
      content: {
        basics: { secondaryCategory: 'farm' },
        housing: { cost: { free: true }, note: 'Cabins by the lake' },
        meals: {
          provided: true,
          perDay: 3,
          days: 'every_day',
          cost: { free: false, cents: 1050, period: 'day', paidBy: 'direct' },
          photos: {
            kitchen: newId(),
            meal_example: newId(),
            dining_area: newId(),
            other: newId(),
          },
          note: '',
          dietary: null,
        },
        genreDetails: { category: 'seasonal', destinationSlug: 'yellowstone', staffPerks: [] },
        job: { visaSponsorship: 'j1' },
      },
    });
    await syncListing(t.db, l.listingId, NOW);
    expect(await rowOf(l.listingId)).toMatchObject({
      categories: ['seasonal', 'farm'],
      secondaryCategory: 'farm',
      housingFree: true,
      housingCostLine: 'Free',
      housingNote: 'Cabins by the lake',
      mealsProvided: true,
      mealsFree: false,
      mealsCostLine: '$10.50/day · paid directly',
      mealsNote: null,
      sponsorsVisas: true,
      destinationSlug: 'yellowstone',
    });
    expect(
      await count(sql`select count(*)::int as n from app.discovery_listings
        where listing_id = ${l.listingId} and search @@ to_tsquery('english', 'yellowstone')`),
    ).toBe(1);
  });

  it('shows the host logo and no cover when the cover is not public', async () => {
    const logo = newId();
    fakeSp2.putHost({ orgId: DEFAULT_ORG_ID, logoMediaId: logo });
    hoisted.privateMedia.add(DEFAULT_COVER_MEDIA_ID);
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, NOW);
    expect(await rowOf(l.listingId)).toMatchObject({
      cover: null,
      hostLogoUrl: `https://media.test/${logo}/320.webp`,
    });
  });

  it('throws and leaves the row as it was when an SP2 read fails', async () => {
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, NOW);
    fakeSp2.putListing({
      listingId: l.listingId,
      revisionId: newId(),
      content: { basics: { title: 'Changed title' } },
    });
    fakeSp2.failNext('getPublishedListing');

    await expect(
      syncHandlers['discovery.sync_listing']?.(
        envelope('listing.changed', { listingId: l.listingId, orgId: l.orgId }),
        ctx(LATER),
      ),
    ).rejects.toThrow('getPublishedListing failed');
    expect(await rowOf(l.listingId)).toMatchObject({
      title: 'Lift operator',
      revisionId: l.revisionId,
      indexedAt: NOW.toISOString(),
    });
  });

  it('throws when the host or location is missing, so the outbox retries', async () => {
    const l = fakeSp2.putListing({ orgId: newId() });
    await expect(syncListing(t.db, l.listingId, NOW)).rejects.toThrow('is not public');
    const m = fakeSp2.putListing({ content: { where: { mode: 'onsite', locationId: newId() } } });
    await expect(syncListing(t.db, m.listingId, NOW)).rejects.toThrow('not found');
    expect(await count(sql`select count(*)::int as n from app.discovery_listings`)).toBe(0);
  });

  it('ends in the latest state, whichever order the syncs run in', async () => {
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, NOW);
    fakeSp2.setListingState(l.listingId, 'closed');
    await syncListing(t.db, l.listingId, NOW);
    expect((await rowOf(l.listingId))?.isActive).toBe(false);

    // Two syncs of one listing at once, after it closed: both read the latest state.
    const b = fakeSp2.putListing();
    await syncListing(t.db, b.listingId, NOW);
    fakeSp2.setListingState(b.listingId, 'closed');
    await Promise.all([syncListing(t.db, b.listingId, NOW), syncListing(t.db, b.listingId, LATER)]);
    expect((await rowOf(b.listingId))?.isActive).toBe(false);
  });

  it('rejects a payload without a listing id', async () => {
    await expect(syncHandlers['discovery.sync_listing']?.({}, ctx())).rejects.toThrow(
      'listingId is required',
    );
  });
});

describe('syncHost', () => {
  async function seedRows(n: number, locationId = DEFAULT_LOCATION_ID): Promise<string[]> {
    const ids = Array.from({ length: n }, () => fakeSp2.putListing().listingId).sort();
    await insertProjectionRows(
      t.db,
      ids.map((listingId) => ({ listingId, hostName: 'Old name', locationId })),
    );
    return ids;
  }

  const renamed = (name: string) =>
    count(sql`select count(*)::int as n from app.discovery_listings where host_name = ${name}`);

  it('re-syncs 100 rows a job and follows up until all 250 are done, for every update', async () => {
    const ids = await seedRows(250);
    fakeSp2.putHost({ orgId: DEFAULT_ORG_ID, name: 'Kettle Ridge Lodge and Spa' });
    await syncHandlers['discovery.sync_host']?.(
      envelope('hostpage.updated', { orgId: DEFAULT_ORG_ID }),
      ctx(),
    );

    expect(await renamed('Kettle Ridge Lodge and Spa')).toBe(100);
    const queued = await queryRows<{ payload: { after: string; orgId: string } }>(
      t.db,
      sql`select payload from app.outbox where topic = 'discovery.sync_host'`,
    );
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payload).toMatchObject({ orgId: DEFAULT_ORG_ID, after: ids[99] });

    for (let run = 0; run < 3; run++) await runWorker(t.db, { handlers: syncHandlers });
    expect(await renamed('Kettle Ridge Lodge and Spa')).toBe(250);

    // A later update of the same host reaches every row too (its follow-ups are its own).
    fakeSp2.putHost({ orgId: DEFAULT_ORG_ID, name: 'Kettle Ridge Resort' });
    await syncHandlers['discovery.sync_host']?.(
      envelope('subscription.changed', { orgId: DEFAULT_ORG_ID, status: 'active', plan: null }),
      ctx(),
    );
    for (let run = 0; run < 3; run++) await runWorker(t.db, { handlers: syncHandlers });
    expect(await renamed('Kettle Ridge Resort')).toBe(250);
  });

  it('re-syncs only the updated location on location.updated', async () => {
    const second = newId();
    fakeSp2.putLocation({ id: second, city: 'Frisco', publicPoint: { lat: 39.57, lng: -106.1 } });
    const home = fakeSp2.putListing();
    const away = fakeSp2.putListing({ content: { where: { mode: 'onsite', locationId: second } } });
    await syncListing(t.db, home.listingId, NOW);
    await syncListing(t.db, away.listingId, NOW);

    fakeSp2.putLocation({ id: second, city: 'Silverthorne' });
    await syncHandlers['discovery.sync_host']?.(
      envelope('location.updated', { locationId: second, orgId: DEFAULT_ORG_ID }),
      ctx(LATER),
    );

    expect(await rowOf(away.listingId)).toMatchObject({
      locationLabel: 'Silverthorne, CO',
      indexedAt: LATER.toISOString(),
    });
    expect((await rowOf(home.listingId))?.indexedAt).toBe(NOW.toISOString());
  });

  it('reports the next cursor and nothing past the last page', async () => {
    const ids = await seedRows(3);
    expect(await syncHost(t.db, { orgId: DEFAULT_ORG_ID }, NOW)).toEqual({ synced: 3, next: null });
    expect(await syncHost(t.db, { orgId: DEFAULT_ORG_ID, after: ids[2] }, NOW)).toEqual({
      synced: 0,
      next: null,
    });
    expect(await syncHost(t.db, { orgId: newId() }, NOW)).toEqual({ synced: 0, next: null });
  });

  it('skips a listing that fails, syncs the rest of the page, and queues that listing for retry', async () => {
    await seedRows(3);
    fakeSp2.failNext('getPublishedListing');
    expect(await syncHost(t.db, { orgId: DEFAULT_ORG_ID }, NOW)).toEqual({ synced: 2, next: null });
    expect(hoisted.raiseAlert).toHaveBeenCalledTimes(1);
    expect(hoisted.raiseAlert).toHaveBeenCalledWith(t.db, {
      severity: 'warning',
      kind: 'discovery.sync_failed',
      message: 'A listing failed to sync and was skipped',
      data: { failed: 1 },
    });
    expect(await renamed('Old name')).toBe(1);
    expect(await renamed('Kettle Ridge Lodge')).toBe(2);
    const [stale] = await queryRows<{ id: string }>(
      t.db,
      sql`select listing_id::text as id from app.discovery_listings where host_name = 'Old name'`,
    );
    const retries = await queryRows<{ payload: { listingId: string } }>(
      t.db,
      sql`select payload from app.outbox where topic = 'discovery.sync_listing'`,
    );
    expect(retries.map((r) => r.payload.listingId)).toEqual([stale?.id]);
    await runWorker(t.db, { handlers: syncHandlers });
    expect(await renamed('Old name')).toBe(0);
    expect(await renamed('Kettle Ridge Lodge')).toBe(3);
  });
});

describe('driftCheck and rebuildSearchProjection', () => {
  const audits = (action: string) =>
    count(sql`select count(*)::int as n from app.audit_events where action = ${action}`);

  it('repairs a missing row, a stale revision and a closed listing, then audits and alerts', async () => {
    const missing = fakeSp2.putListing();
    const stale = fakeSp2.putListing();
    const closed = fakeSp2.putListing();
    const fine = fakeSp2.putListing();
    for (const l of [stale, closed, fine]) await syncListing(t.db, l.listingId, NOW);
    const newRevision = newId();
    fakeSp2.putListing({ listingId: stale.listingId, revisionId: newRevision });
    fakeSp2.setListingState(closed.listingId, 'closed');
    const before = await audits('discovery.drift_repaired');

    await syncHandlers['discovery.drift_check']?.(null, ctx(LATER));

    expect(await audits('discovery.drift_repaired')).toBe(before + 1);
    expect(hoisted.raiseAlert).toHaveBeenCalledTimes(1);
    expect(hoisted.raiseAlert).toHaveBeenCalledWith(expect.anything(), {
      severity: 'warning',
      kind: 'discovery.drift',
      message: 'Search projection drifted from listings',
      data: { upserted: 2, removed: 1, repaired: 3 },
    });
    expect((await rowOf(missing.listingId))?.isActive).toBe(true);
    expect((await rowOf(stale.listingId))?.revisionId).toBe(newRevision);
    expect((await rowOf(closed.listingId))?.isActive).toBe(false);
    expect((await rowOf(fine.listingId))?.indexedAt).toBe(NOW.toISOString());
  });

  it('returns the counts and stays quiet when nothing drifted', async () => {
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, NOW);
    const before = await audits('discovery.drift_repaired');

    expect(await driftCheck(t.db, LATER)).toEqual({ upserted: 0, removed: 0, repaired: 0 });
    expect(await audits('discovery.drift_repaired')).toBe(before);
    expect(hoisted.raiseAlert).not.toHaveBeenCalled();
  });

  it('removes active rows that SP2 no longer knows', async () => {
    await insertProjectionRows(t.db, [{}, {}]);
    expect(await driftCheck(t.db, NOW)).toEqual({ upserted: 0, removed: 2, repaired: 2 });
    expect(await count(sql`select count(*)::int as n from app.discovery_listings`)).toBe(0);
  });

  it('removes a closed row whose listing was removed later, and keeps a closed one', async () => {
    const seeker = await seedSeeker();
    const removedLater = fakeSp2.putListing();
    const stillClosed = fakeSp2.putListing();
    for (const l of [removedLater, stillClosed]) {
      await syncListing(t.db, l.listingId, NOW);
      fakeSp2.setListingState(l.listingId, 'closed');
      await syncListing(t.db, l.listingId, NOW);
    }
    await seedSeekerState(seeker, removedLater.listingId);
    // The removal's own sync never ran (say it dead-lettered).
    fakeSp2.setListingState(removedLater.listingId, 'removed');

    expect(await driftCheck(t.db, LATER)).toEqual({ upserted: 0, removed: 1, repaired: 1 });
    expect(await rowOf(removedLater.listingId)).toBeUndefined();
    expect(
      await count(sql`select count(*)::int as n from app.listing_dispositions
        where listing_id = ${removedLater.listingId}`),
    ).toBe(0);
    expect(await rowOf(stillClosed.listingId)).toMatchObject({
      isActive: false,
      closedAt: NOW.toISOString(),
    });
  });

  it('rebuilds with the same passes and records the rebuild', async () => {
    fakeSp2.putListing();
    fakeSp2.putListing();
    await insertProjectionRows(t.db, [{}]);
    const before = await audits('discovery.projection_rebuilt');

    expect(await rebuildSearchProjection(t.db)).toEqual({ upserted: 2, removed: 1 });
    expect(await audits('discovery.projection_rebuilt')).toBe(before + 1);
    expect(hoisted.raiseAlert).not.toHaveBeenCalled();
  });

  it('continues the drift check when one listing fails, and raises one alert', async () => {
    const a = fakeSp2.putListing();
    const b = fakeSp2.putListing();
    fakeSp2.failNext('getPublishedListing');
    expect(await driftCheck(t.db, NOW)).toEqual({ upserted: 1, removed: 0, repaired: 1 });
    expect(hoisted.raiseAlert).toHaveBeenCalledWith(
      t.db,
      expect.objectContaining({
        kind: 'discovery.sync_failed',
        message: 'A listing failed to sync and was skipped',
        data: { failed: 1 },
      }),
    );
    const present = [await rowOf(a.listingId), await rowOf(b.listingId)].filter(Boolean);
    expect(present).toHaveLength(1);
  });
});
