// The SP3 fakes of SP2 and media (SP3 plan Task 5): they behave like the modules they stand in
// for, the default content is valid against SP2's real schema, and the documented vi.mock
// pattern swaps them in.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { GENRES } from '@/lib/taxonomy';
import * as hostpages from '@/modules/hostpages';
import { ListingContentSchema } from '@/modules/listings';
import * as locations from '@/modules/locations';
import {
  DEFAULT_LOCATION_ID,
  DEFAULT_ORG_ID,
  makeListingContent,
  makePublishedListing,
} from './listing-content';
import { mediaFake } from './media';
import { fakeSp2, hostpagesFake, listingsFake, locationsFake } from './sp2';

vi.mock('@/modules/locations', async () => (await import('./sp2')).locationsFake);
// The real hostpages registers its weather filter with locations as it loads, which the
// locations fake can't take, so it is replaced too. Discovery then loads only the fake.
vi.mock('@/modules/hostpages', async () => (await import('./sp2')).hostpagesFake);
// The spread form: the fake's functions over the real module's other exports (the schema).
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('./sp2')).listingsFake,
}));

const db = {} as Db;

beforeEach(() => {
  fakeSp2.reset();
  mediaFake.reset();
});

describe('makeListingContent', () => {
  it("passes SP2's real ListingContentSchema", () => {
    expect(ListingContentSchema.parse(makeListingContent())).toEqual(makeListingContent());
  });

  it('is the default Lift operator', () => {
    const c = makeListingContent();
    expect(c.basics).toMatchObject({
      title: 'Lift operator',
      primaryCategory: 'seasonal',
      genre: 'ski_resorts',
    });
    expect(c.where).toEqual({ mode: 'onsite', locationId: DEFAULT_LOCATION_ID });
    expect(c.when.dates).toEqual({ mode: 'fixed', start: '2026-12-01', end: '2027-04-15' });
    expect(c.when.weeklyHours).toBe(40);
    expect(c.pay).toMatchObject({
      kind: 'fixed',
      minCents: 1900,
      maxCents: 1900,
      unit: 'hour',
      frequency: 'biweekly',
    });
    expect(c.housing).toMatchObject({
      provided: true,
      cost: { free: false, cents: 15000, period: 'week', paidBy: 'deducted' },
    });
    expect(c.meals).toEqual({ provided: false });
    expect(c.job.visaSponsorship).toBe('none');
    expect(c.photos.coverMediaId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('merges overrides deeply and replaces a union member whose discriminator changes', () => {
    const hostLocationId = '019a4a3c-0000-7000-8000-00000000b002';
    const c = makeListingContent({
      basics: { title: 'Support agent', primaryCategory: 'remote' },
      where: { mode: 'remote', scope: 'states', states: ['CO', 'UT'], hostLocationId },
      housing: { provided: false },
      pay: { minCents: 2000, maxCents: 2400, kind: 'range' },
    });
    expect(c.basics.title).toBe('Support agent');
    expect(c.basics.genre).toBe('customer_support');
    expect(c.genreDetails.category).toBe('remote');
    expect(c.where).toEqual({
      mode: 'remote',
      scope: 'states',
      states: ['CO', 'UT'],
      hostLocationId,
    });
    expect(c.housing).toEqual({ provided: false });
    expect(c.pay).toMatchObject({ minCents: 2000, maxCents: 2400, unit: 'hour' });
    expect(ListingContentSchema.safeParse(c).success).toBe(true);
  });

  it('builds a valid listing for every category', () => {
    for (const primaryCategory of ['maritime', 'seasonal', 'farm', 'remote'] as const) {
      const c = makeListingContent({ basics: { primaryCategory } });
      expect(ListingContentSchema.safeParse(c).success, primaryCategory).toBe(true);
    }
  });
});

describe('makePublishedListing', () => {
  it('belongs to the default org and carries the content', () => {
    const l = makePublishedListing({ content: { basics: { title: 'Night auditor' } } });
    expect(l.orgId).toBe(DEFAULT_ORG_ID);
    expect(l.content.basics.title).toBe('Night auditor');
    expect(l.firstPublishedAt.getTime()).toBeLessThan(Date.now());
    expect(l.provenance).toBe('host_created');
  });
});

describe('fakeSp2 listings', () => {
  it('returns a listing put in, while it is active', async () => {
    const l = fakeSp2.putListing({ content: { basics: { title: 'Deckhand' } } });
    expect(await listingsFake.getPublishedListing(db, l.listingId)).toEqual(l);
    const summaries = await listingsFake.getListingSummaries(db, [l.listingId, 'unknown']);
    expect(summaries.get(l.listingId)).toEqual({
      orgId: DEFAULT_ORG_ID,
      title: 'Deckhand',
      state: 'active',
      locationId: DEFAULT_LOCATION_ID,
      primaryCategory: 'seasonal',
      publishedRevisionId: l.revisionId,
    });
    expect(summaries.has('unknown')).toBe(false);
  });

  it('hides a closed listing but still reports its state', async () => {
    const l = fakeSp2.putListing();
    fakeSp2.setListingState(l.listingId, 'closed');
    expect(await listingsFake.getPublishedListing(db, l.listingId)).toBeNull();
    expect(
      (await listingsFake.getListingSummaries(db, [l.listingId])).get(l.listingId)?.state,
    ).toBe('closed');
    fakeSp2.setListingState(l.listingId, 'removed');
    expect(
      (await listingsFake.getListingSummaries(db, [l.listingId])).get(l.listingId)?.state,
    ).toBe('removed');
  });

  it('pages active listings by id', async () => {
    const ids = [fakeSp2.putListing(), fakeSp2.putListing(), fakeSp2.putListing()]
      .map((l) => l.listingId)
      .sort();
    const closed = fakeSp2.putListing();
    fakeSp2.setListingState(closed.listingId, 'closed');

    const first = await listingsFake.listActiveListings(db, { limit: 2 });
    expect(first.items.map((l) => l.listingId)).toEqual(ids.slice(0, 2));
    expect(first.next).not.toBeNull();
    const second = await listingsFake.listActiveListings(db, {
      limit: 2,
      after: first.next ?? undefined,
    });
    expect(second.items.map((l) => l.listingId)).toEqual(ids.slice(2));
    expect(second.next).toBeNull();
  });

  it('fails the next call of a function once', async () => {
    const l = fakeSp2.putListing();
    fakeSp2.failNext('getPublishedListing');
    await expect(listingsFake.getPublishedListing(db, l.listingId)).rejects.toThrow(
      'getPublishedListing',
    );
    expect(await listingsFake.getPublishedListing(db, l.listingId)).toEqual(l);
  });

  it('lists the 25 genres and records stats providers', () => {
    expect(listingsFake.GENRES).toHaveLength(25);
    expect(listingsFake.GENRES).toContainEqual({
      code: 'ski_resorts',
      label: 'Ski resorts',
      category: 'seasonal',
    });
    expect(listingsFake.GENRES).toBe(GENRES);
    const fn = async () => new Map();
    listingsFake.registerListingStatsProvider('other', fn);
    expect(fakeSp2.statsProviders.get('other')).toBe(fn);
  });

  it("records the discovery module's load-time stats provider, through reset", async () => {
    await import('@/modules/discovery');
    fakeSp2.reset();
    expect(fakeSp2.statsProviders.get('discovery')).toBeTypeOf('function');
  });

  it('lists the default occupation', async () => {
    expect(await listingsFake.listOccupations(db)).toContainEqual(
      expect.objectContaining({ code: 'lift_operator', label: 'Lift operator' }),
    );
  });
});

describe('fakeSp2 hosts and locations', () => {
  it('starts with the default host and location', async () => {
    const hosts = await hostpagesFake.getHostIdentities(db, [DEFAULT_ORG_ID]);
    expect(hosts.get(DEFAULT_ORG_ID)).toMatchObject({
      name: 'Kettle Ridge Lodge',
      slug: 'kettle-ridge-lodge',
    });
    const locs = await locationsFake.getLocations(db, [DEFAULT_LOCATION_ID]);
    expect(locs.get(DEFAULT_LOCATION_ID)).toMatchObject({
      orgId: DEFAULT_ORG_ID,
      city: 'Breckenridge',
      state: 'CO',
      publicPoint: { lat: 39.48, lng: -106.04 },
      publicPrecision: 'city',
    });
    expect(await locationsFake.listDestinations(db)).toEqual([
      { slug: 'yellowstone', name: 'Yellowstone National Park', states: ['WY', 'MT', 'ID'] },
    ]);
  });

  it('puts hosts, locations and destinations', async () => {
    const orgId = '019a4a3c-0000-7000-8000-00000000a002';
    fakeSp2.putHost({ orgId, name: 'Seward Fishing Co' });
    fakeSp2.putLocation({
      id: 'loc-2',
      orgId,
      city: 'Seward',
      state: 'AK',
      publicPrecision: 'exact',
    });
    fakeSp2.setDestinations([{ slug: 'glacier', name: 'Glacier National Park', states: ['MT'] }]);
    expect((await hostpagesFake.getHostIdentities(db, [orgId])).get(orgId)?.slug).toBe(
      'seward-fishing-co',
    );
    expect((await locationsFake.getLocations(db, ['loc-2'])).get('loc-2')).toMatchObject({
      city: 'Seward',
      publicPrecision: 'exact',
    });
    expect((await locationsFake.listDestinations(db)).map((d) => d.slug)).toEqual(['glacier']);
    const slugs = await hostpagesFake.listPublicHostSlugs(db, { limit: 1 });
    expect(slugs.items.map((s) => s.slug)).toEqual(['kettle-ridge-lodge']);
    expect(slugs.next).not.toBeNull();
  });

  it('fails host and location reads on request', async () => {
    fakeSp2.failNext('getHostIdentities');
    fakeSp2.failNext('getLocations');
    await expect(hostpagesFake.getHostIdentities(db, [DEFAULT_ORG_ID])).rejects.toThrow();
    await expect(locationsFake.getLocations(db, [DEFAULT_LOCATION_ID])).rejects.toThrow();
    expect((await hostpagesFake.getHostIdentities(db, [DEFAULT_ORG_ID])).size).toBe(1);
  });

  it('stands in for the module with vi.mock', async () => {
    expect(locations.getLocations).toBe(locationsFake.getLocations);
    expect((await locations.getLocations(db, [DEFAULT_LOCATION_ID])).size).toBe(1);
    expect(hostpages.getHostIdentities).toBe(hostpagesFake.getHostIdentities);
    expect((await hostpages.getHostIdentities(db, [DEFAULT_ORG_ID])).size).toBe(1);
  });

  it('serves the fake to a dynamic import of @/modules/hostpages, as discovery makes', async () => {
    const loaded = await import('@/modules/hostpages');
    expect(loaded.getHostIdentities).toBe(hostpagesFake.getHostIdentities);
    expect(loaded.listPublicHostSlugs).toBe(hostpagesFake.listPublicHostSlugs);
  });
});

describe('mediaFake', () => {
  it('serves media URLs and alt text by id', async () => {
    const storage = mediaFake.getStorage();
    expect(mediaFake.getStorage()).toBe(storage);
    const viewer = {
      userId: '00000000-0000-0000-0000-000000000000',
      orgIds: [],
      isOperator: false,
    };
    expect(await mediaFake.getMediaUrl(db, storage, viewer, 'm1', 640)).toBe(
      'https://media.test/m1/640.webp',
    );
    const info = await mediaFake.getMediaInfo(db, ['m1', 'm2']);
    expect(info.get('m1')?.altText).toBe('Alt for m1');
    expect(info.get('m2')?.status).toBe('approved');
  });

  it('keeps bytes in its memory storage', async () => {
    const storage = mediaFake.getStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.write('media-public', 'a/b.webp', bytes, 'image/webp');
    expect(await storage.read('media-public', 'a/b.webp')).toEqual(bytes);
    await expect(storage.read('media-public', 'missing')).rejects.toThrow();
  });
});
