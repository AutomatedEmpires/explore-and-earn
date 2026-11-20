// SP2 listing content for SP3 tests (SP3 plan Task 5). The default is a complete, valid
// Seasonal "Lift operator" at Kettle Ridge Lodge (the default host and location of
// tests/fakes/sp2.ts and tests/helpers/discovery-rows.ts): onsite, 2026-12-01 to 2027-04-15,
// 40 hours a week, $19 an hour paid every 2 weeks, shared-room housing at $150 a week deducted
// from pay, no meals, no visa sponsorship.
//
// Overrides merge deeply. Arrays replace, and an object whose discriminator changes (`mode`,
// `provided`, `free`, `category`) replaces the default instead of merging into it, so
// `{ where: { mode: 'remote', ... } }` carries no stale `locationId`. Changing
// `basics.primaryCategory` alone also switches `genreDetails` and the genre to that category's.
//
// Imports no module at runtime, so the SP2 fakes that use it can stand in for a mocked module.
import { newId } from '@/lib/ids';
import type { Category } from '@/lib/taxonomy';
import type { DeepPartial, ListingContent, PublishedListing } from '@/modules/listings';

/** The default host (Kettle Ridge Lodge); tests/helpers/discovery-rows.ts uses the same id. */
export const DEFAULT_ORG_ID = '019a4a3c-0000-7000-8000-00000000a001';
/** The default location (Breckenridge, CO); tests/helpers/discovery-rows.ts uses the same id. */
export const DEFAULT_LOCATION_ID = '019a4a3c-0000-7000-8000-00000000b001';

/** The default cover photo (mediaFake serves it at https://media.test/<id>/<width>.webp). */
export const DEFAULT_COVER_MEDIA_ID = '019a4a3c-0000-7000-8000-00000000c001';
export const DEFAULT_HOUSING_PHOTOS = {
  bedroom: '019a4a3c-0000-7000-8000-00000000c011',
  bathroom: '019a4a3c-0000-7000-8000-00000000c012',
  kitchen: '019a4a3c-0000-7000-8000-00000000c013',
  exterior: '019a4a3c-0000-7000-8000-00000000c014',
} as const;

const DAY_MS = 86_400_000;

const GENRE_DETAILS: Record<Category, ListingContent['genreDetails']> = {
  maritime: {
    category: 'maritime',
    vesselType: 'Longliner',
    homePort: 'Seward, AK',
    rotation: null,
    timeAtSea: null,
    documents: [],
  },
  seasonal: { category: 'seasonal', destinationSlug: null, staffPerks: [] },
  farm: {
    category: 'farm',
    operationType: 'Orchard',
    harvestWindow: null,
    equipment: [],
    certifications: [],
  },
  remote: {
    category: 'remote',
    timeZoneOverlap: '9am to 1pm Mountain',
    equipmentProvided: null,
    internet: null,
    travel: 'none',
  },
};

const DEFAULT_GENRE: Record<Category, string> = {
  maritime: 'commercial_fishing',
  seasonal: 'ski_resorts',
  farm: 'orchards_and_vineyards',
  remote: 'customer_support',
};

function defaults(category: Category): ListingContent {
  return {
    basics: {
      title: 'Lift operator',
      primaryCategory: category,
      genre: DEFAULT_GENRE[category],
      secondaryCategory: null,
      occupationCode: 'lift_operator',
      openings: 2,
      employmentType: 'employee',
      schedule: 'full_time',
    },
    where: { mode: 'onsite', locationId: DEFAULT_LOCATION_ID },
    when: {
      dates: { mode: 'fixed', start: '2026-12-01', end: '2027-04-15' },
      weeklyHours: 40,
      minCommitment: null,
    },
    pay: {
      kind: 'fixed',
      minCents: 1900,
      maxCents: 1900,
      unit: 'hour',
      crewShareEstimate: null,
      overtime: false,
      tips: false,
      bonuses: null,
      frequency: 'biweekly',
      deductions: null,
    },
    housing: {
      provided: true,
      type: 'shared_room',
      cost: { free: false, cents: 15000, period: 'week', paidBy: 'deducted' },
      photos: { ...DEFAULT_HOUSING_PHOTOS },
      note: '',
      finePrint: {
        roommates: 1,
        pets: false,
        couples: false,
        wifi: true,
        utilitiesIncluded: true,
        notes: null,
      },
    },
    meals: { provided: false },
    genreDetails: structuredClone(GENRE_DETAILS[category]),
    job: {
      description:
        'Run the chairlift at the base of the mountain: load guests safely, keep the ramps clear and help anyone who needs it.',
      responsibilities: ['Load and unload guests', 'Keep the ramps clear of snow'],
      typicalDay: null,
      requiredQualifications: [],
      preferredQualifications: [],
      skills: [],
      certifications: [],
      physicalDemands: null,
      minAge: 18,
      perks: [],
      visaSponsorship: 'none',
    },
    photos: { coverMediaId: DEFAULT_COVER_MEDIA_ID, galleryMediaIds: [] },
    applying: { questions: [], additionalStep: null, deadline: null, notifyMemberIds: [] },
  };
}

const DISCRIMINATORS = ['mode', 'provided', 'free', 'category'];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

function merge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (!isObject(base) || !isObject(over)) return over;
  if (DISCRIMINATORS.some((k) => k in over && k in base && over[k] !== base[k])) return over;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = merge(base[key], value);
  return out;
}

/** A complete ListingContent: the default with `o` merged over it. */
export function makeListingContent(o: DeepPartial<ListingContent> = {}): ListingContent {
  const category = o.basics?.primaryCategory ?? 'seasonal';
  const base = defaults(category);
  return merge(base, o) as ListingContent;
}

/** A PublishedListing of the default org, first published a day ago. */
export function makePublishedListing(
  o: Partial<Omit<PublishedListing, 'content'>> & { content?: DeepPartial<ListingContent> } = {},
): PublishedListing {
  const { content, ...rest } = o;
  const publishedAt = new Date(Date.now() - DAY_MS);
  return {
    listingId: newId(),
    revisionId: newId(),
    orgId: DEFAULT_ORG_ID,
    firstPublishedAt: publishedAt,
    publishedAt,
    confirmedActiveAt: null,
    autoCloseAt: null,
    applicationsCloseAt: null,
    provenance: 'host_created',
    ...rest,
    content: makeListingContent(content),
  };
}
