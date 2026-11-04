// The discovery contract types (SP3 spec sections 3.1 and 3.3), shared by the server module
// (`@/modules/discovery` re-exports them) and client code. Client-safe: type-only imports.
import type { ListingContent } from '@/modules/listings';
import type { Category } from '@/ui/categories';

/** Where a seeker found a listing. Equals SP4's ApplicationSource. */
export const DISCOVERY_SOURCES = [
  'seek',
  'swipe',
  'map',
  'invite',
  'boost',
  'landing',
  'other',
] as const;
export type DiscoverySource = (typeof DISCOVERY_SOURCES)[number];

export type DiscoverySort = 'relevant' | 'newest' | 'distance';
export type DispositionState = 'saved' | 'skipped';
export type ListingEventType = 'view' | 'save' | 'share' | 'apply';

export const SEASONS = ['spring', 'summer', 'fall', 'winter', 'year_round'] as const;
export type Season = (typeof SEASONS)[number];

/** Ties between categories on a map pin go to the earlier one (spec 8.6). */
export const PIN_CATEGORY_ORDER = ['maritime', 'seasonal', 'farm', 'remote'] as const;

export type DiscoveryQuery = {
  q?: string;
  categories?: Category[];
  genres?: string[];
  states?: string[];
  destination?: string;
  orgId?: string;
  start?: { withinMonths: 1 | 3 | 6 } | { season: Season; year: number };
  startingSoon?: boolean;
  housing?: 'provided' | 'free';
  meals?: 'provided' | 'free';
  sponsorsVisas?: boolean;
  pay?: { minCents: number; unit: 'hour' | 'day' | 'year' };
  bbox?: [west: number, south: number, east: number, north: number];
  locationId?: string;
};

export type Amenity = {
  provided: boolean;
  free: boolean;
  costLine: string | null;
  note: string | null;
};

export type JobCardData = {
  listingId: string;
  href: string;
  title: string;
  category: Category;
  secondaryCategory: Category | null;
  genre: string | null;
  status: 'active' | 'closed';
  remote: boolean;
  locationLabel: string;
  host: {
    orgId: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    subscriberSince: string | null;
  };
  cover: { src: Record<320 | 640 | 1280, string>; alt: string } | null;
  dateLine: { info: string; end: string | null };
  housing: Amenity;
  meals: Amenity;
  pay: { chip: string; full: string; details: string[] };
  sponsorsVisas: boolean;
  /** From the placement hook's boostedAmong. */
  boosted: { boostId: string } | null;
  /** Null for guests. */
  viewer: { disposition: DispositionState | null; applied: boolean } | null;
};

export type ListingDetail = JobCardData & {
  content: ListingContent;
  revisionId: string;
  publishedAt: string;
  photoUrls: Record<string, Record<320 | 640 | 1280, string>>;
  activityLine: string;
  categoryFields: { label: string; value: string }[];
  additionalStep: { note: string; url: string; domain: string } | null;
  validThrough: string | null;
};

export type MapPin = {
  kind: 'pin';
  locationId: string;
  orgId: string;
  lat: number;
  lng: number;
  category: Category;
  categories: Category[];
  remoteOnly: boolean;
  matchingCount: number;
  boosted: boolean;
};

export type MapCluster = {
  kind: 'cluster';
  lat: number;
  lng: number;
  listings: number;
  locations: number;
};

export type HostPreview = {
  orgId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  locationLabel: string;
  approximate: boolean;
  categories: Category[];
  remoteLine: string | null;
};

/** The `ee_install` localStorage value (spec 8.15). Never leaves the device. */
export type InstallState = {
  v: 1;
  shows: number;
  holdUntil: string | null;
  installedAt: string | null;
};

export type DiscoveryExport = {
  saved: { listingId: string; at: string }[];
  skipped: { listingId: string; at: string }[];
  savedSearches: { name: string; query: DiscoveryQuery; createdAt: string }[];
  alertSettings: { weeklyDigest: boolean };
};

/** What the filter panel offers. */
export type FilterOptions = {
  genres: { slug: string; label: string; category: Category }[];
  states: { code: string; name: string }[];
  destinations: { slug: string; name: string }[];
  seasonYears: [number, number];
};

/** Display names for the IDs and slugs in a query (filter chips, alert names). */
export type QueryLabels = {
  genres: Record<string, string>;
  destinations: Record<string, string>;
  host: { orgId: string; slug: string; name: string } | null;
};

/** One removable active filter; `key` is what removeFilter takes. */
export type FilterChip = { key: string; label: string };
