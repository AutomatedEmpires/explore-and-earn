// In-memory SP2 reads for SP3 unit tests (SP3 plan Task 5): the parts of @/modules/listings,
// @/modules/hostpages and @/modules/locations that discovery and landing consume, behind one
// controller, `fakeSp2`. (SP2's own fakes, for SP2's B1 tests, live in tests/fakes/sp2/.)
//
// Usage, from a test file in src/modules/<name>/:
//
//   vi.mock('@/modules/listings', async () => (await import('../../../tests/fakes/sp2')).listingsFake);
//   vi.mock('@/modules/hostpages', async () => (await import('../../../tests/fakes/sp2')).hostpagesFake);
//   vi.mock('@/modules/locations', async () => (await import('../../../tests/fakes/sp2')).locationsFake);
//   beforeEach(() => fakeSp2.reset());
//
// Each object replaces the whole module, so a test that also needs a real export of that module
// (ListingContentSchema, say) spreads the original first:
//
//   vi.mock('@/modules/listings', async (orig) => ({
//     ...(await orig<typeof import('@/modules/listings')>()),
//     ...(await import('../../../tests/fakes/sp2')).listingsFake,
//   }));
//
// After reset() there is one host (Kettle Ridge Lodge, DEFAULT_ORG_ID) with one location
// (Breckenridge, CO, DEFAULT_LOCATION_ID, city precision), the Yellowstone destination and a few
// occupations, and no listings. putListing() adds an active listing of that host by default.
// This file imports no module at runtime, so it can stand in for one.
import type { Category } from '@/lib/taxonomy';
import { CATEGORIES, GENRES, PERKS } from '@/lib/taxonomy';
import type { HostIdentity } from '@/modules/hostpages';
import type {
  DeepPartial,
  ListingContent,
  ListingState,
  ListingStatsProvider,
  ListingSummary,
  PublishedListing,
} from '@/modules/listings';
import type { Location } from '@/modules/locations';
import { DEFAULT_LOCATION_ID, DEFAULT_ORG_ID, makePublishedListing } from './listing-content';

export { DEFAULT_LOCATION_ID, DEFAULT_ORG_ID };

type Occupation = { code: string; label: string; socCode: string; categories: Category[] };
type Destination = { slug: string; name: string; states: string[] };
type Failable =
  'getPublishedListing' | 'getListingSummaries' | 'getHostIdentities' | 'getLocations';

const DEFAULT_HOST: HostIdentity = {
  orgId: DEFAULT_ORG_ID,
  name: 'Kettle Ridge Lodge',
  slug: 'kettle-ridge-lodge',
  logoMediaId: null,
  coverMediaId: null,
  subscriber: { hostSince: new Date('2026-11-03T00:00:00Z') },
  hiringNow: true,
  homeLocation: { city: 'Breckenridge', state: 'CO' },
};

const DEFAULT_LOCATION: Location = {
  id: DEFAULT_LOCATION_ID,
  orgId: DEFAULT_ORG_ID,
  name: 'Base area',
  kind: 'business_site',
  city: 'Breckenridge',
  state: 'CO',
  publicPoint: { lat: 39.48, lng: -106.04 },
  publicPrecision: 'city',
  publicAddressLine1: null,
  timezone: 'America/Denver',
  archived: false,
};

const DEFAULT_DESTINATIONS: Destination[] = [
  { slug: 'yellowstone', name: 'Yellowstone National Park', states: ['WY', 'MT', 'ID'] },
];

const DEFAULT_OCCUPATIONS: Occupation[] = [
  { code: 'lift_operator', label: 'Lift operator', socCode: '39-3091', categories: ['seasonal'] },
  { code: 'deckhand', label: 'Deckhand', socCode: '53-5011', categories: ['maritime'] },
  { code: 'farmworker', label: 'Farmworker', socCode: '45-2092', categories: ['farm'] },
  {
    code: 'customer_service_representative',
    label: 'Customer service representative',
    socCode: '43-4051',
    categories: ['remote'],
  },
];

const state = {
  listings: new Map<string, { listing: PublishedListing; state: ListingState }>(),
  hosts: new Map<string, { host: HostIdentity; updatedAt: Date }>(),
  locations: new Map<string, Location>(),
  destinations: [] as Destination[],
  occupations: [] as Occupation[],
  failing: new Set<Failable>(),
  statsProviders: new Map<string, ListingStatsProvider>(),
  calls: [] as { name: string; args: unknown[] }[],
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Logs the call, and throws when the test asked this function to fail once. */
function enter(name: string, args: unknown[]): void {
  state.calls.push({ name, args });
  if (state.failing.delete(name as Failable)) throw new Error(`fakeSp2: ${name} failed`);
}

function locationOf(l: PublishedListing): string {
  return l.content.where.mode === 'remote'
    ? l.content.where.hostLocationId
    : l.content.where.locationId;
}

function summaryOf(l: PublishedListing, listingState: ListingState): ListingSummary {
  return {
    orgId: l.orgId,
    title: l.content.basics.title,
    state: listingState,
    locationId: locationOf(l),
    primaryCategory: l.content.basics.primaryCategory,
    publishedRevisionId: l.revisionId,
  };
}

const activeListings = () =>
  [...state.listings.values()]
    .filter((r) => r.state === 'active')
    .map((r) => r.listing)
    .sort((a, b) => a.listingId.localeCompare(b.listingId));

/** The controller tests drive. */
export const fakeSp2 = {
  calls: state.calls,
  /** Every provider registered through registerListingStatsProvider, by name. */
  statsProviders: state.statsProviders,

  /**
   * Back to the defaults: one host, one location, Yellowstone, no listings, nothing failing.
   * Stats providers stay: modules register them once, when they load.
   */
  reset(): void {
    state.listings.clear();
    state.hosts.clear();
    state.hosts.set(DEFAULT_ORG_ID, { host: structuredClone(DEFAULT_HOST), updatedAt: new Date() });
    state.locations.clear();
    state.locations.set(DEFAULT_LOCATION_ID, structuredClone(DEFAULT_LOCATION));
    state.destinations = structuredClone(DEFAULT_DESTINATIONS);
    state.occupations = structuredClone(DEFAULT_OCCUPATIONS);
    state.failing.clear();
    state.calls.length = 0;
  },

  /** Adds (or replaces, by listingId) an active listing; returns it. */
  putListing(
    o: Partial<Omit<PublishedListing, 'content'>> & { content?: DeepPartial<ListingContent> } = {},
  ): PublishedListing {
    const listing = makePublishedListing(o);
    state.listings.set(listing.listingId, { listing: structuredClone(listing), state: 'active' });
    return listing;
  },

  setListingState(listingId: string, listingState: ListingState): void {
    const row = state.listings.get(listingId);
    if (!row) throw new Error(`fakeSp2: no listing ${listingId}`);
    row.state = listingState;
  },

  /** Adds a host, or merges into the one with this orgId. A new host's slug follows its name. */
  putHost(h: Partial<HostIdentity> & { orgId: string }): HostIdentity {
    const existing = state.hosts.get(h.orgId)?.host;
    const name = h.name ?? existing?.name ?? DEFAULT_HOST.name;
    const host: HostIdentity = {
      ...structuredClone(existing ?? DEFAULT_HOST),
      slug: existing?.slug ?? slugify(name),
      ...h,
      name,
    };
    state.hosts.set(h.orgId, { host, updatedAt: new Date() });
    return structuredClone(host);
  },

  /** Adds a location, or merges into the one with this id (defaults: the Breckenridge one). */
  putLocation(l: Partial<Location> & { id: string }): Location {
    const location: Location = {
      ...structuredClone(state.locations.get(l.id) ?? DEFAULT_LOCATION),
      ...l,
    };
    state.locations.set(l.id, location);
    return structuredClone(location);
  },

  setDestinations(d: Destination[]): void {
    state.destinations = structuredClone(d);
  },

  setOccupations(o: Occupation[]): void {
    state.occupations = structuredClone(o);
  },

  /** The next call of `fn` throws (once), as an SP2 read failing mid-sync would. */
  failNext(fn: Failable): void {
    state.failing.add(fn);
  },
};

type ListingsFns = Pick<
  typeof import('@/modules/listings'),
  | 'getListingSummaries'
  | 'getPublishedListing'
  | 'listActiveListings'
  | 'listOccupations'
  | 'registerListingStatsProvider'
>;

const listingsFns: ListingsFns = {
  async getListingSummaries(_db, ids) {
    enter('getListingSummaries', [ids]);
    const out = new Map<string, ListingSummary>();
    for (const id of ids) {
      const row = state.listings.get(id);
      if (row) out.set(id, summaryOf(row.listing, row.state));
    }
    return out;
  },

  async getPublishedListing(_db, listingId) {
    enter('getPublishedListing', [listingId]);
    const row = state.listings.get(listingId);
    return row && row.state === 'active' ? structuredClone(row.listing) : null;
  },

  async listActiveListings(_db, i) {
    enter('listActiveListings', [i]);
    const after = i.after;
    const from = after ? activeListings().filter((l) => l.listingId > after) : activeListings();
    const items = from.slice(0, i.limit).map((l) => structuredClone(l));
    const last = items[items.length - 1];
    return { items, next: from.length > i.limit && last ? last.listingId : null };
  },

  async listOccupations() {
    enter('listOccupations', []);
    return structuredClone(state.occupations);
  },

  registerListingStatsProvider(name, fn) {
    state.calls.push({ name: 'registerListingStatsProvider', args: [name] });
    state.statsProviders.set(name, fn);
  },
};

/** Stands in for @/modules/listings (reads, the stats registry and the taxonomy). */
export const listingsFake = { ...listingsFns, CATEGORIES, GENRES, PERKS };

type HostpagesFns = Pick<
  typeof import('@/modules/hostpages'),
  'getHostIdentities' | 'listPublicHostSlugs'
>;

/** Stands in for @/modules/hostpages. */
export const hostpagesFake: HostpagesFns = {
  async getHostIdentities(_db, orgIds) {
    enter('getHostIdentities', [orgIds]);
    const out = new Map<string, HostIdentity>();
    for (const id of orgIds) {
      const row = state.hosts.get(id);
      if (row) out.set(id, structuredClone(row.host));
    }
    return out;
  },

  async listPublicHostSlugs(_db, i) {
    enter('listPublicHostSlugs', [i]);
    const all = [...state.hosts.values()]
      .map((r) => ({ slug: r.host.slug, updatedAt: r.updatedAt }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    const after = i.after;
    const from = after ? all.filter((s) => s.slug > after) : all;
    const items = from.slice(0, i.limit);
    const last = items[items.length - 1];
    return { items, next: from.length > i.limit && last ? last.slug : null };
  },
};

type LocationsFns = Pick<typeof import('@/modules/locations'), 'getLocations' | 'listDestinations'>;

/** Stands in for @/modules/locations. */
export const locationsFake: LocationsFns = {
  async getLocations(_db, ids) {
    enter('getLocations', [ids]);
    const out = new Map<string, Location>();
    for (const id of ids) {
      const l = state.locations.get(id);
      if (l) out.set(id, structuredClone(l));
    }
    return out;
  },

  async listDestinations() {
    enter('listDestinations', []);
    return structuredClone(state.destinations);
  },
};

fakeSp2.reset();
