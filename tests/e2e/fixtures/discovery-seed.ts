// Discovery e2e hosts and listings (SP3 plan Task 27). `pnpm e2e:seed` writes the result.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '@/lib/db';
import type { ListingContent } from '@/modules/listings';
import type { SeedHost } from './sp2-writes';

export const SEED_FILE = path.resolve(import.meta.dirname, '../.seed.json');

export type DiscoveryFixtures = {
  listings: Record<
    'liftOperator' | 'deckhand' | 'orchardPicker' | 'supportAgent' | 'closed',
    { id: string; slug: string; locationId: string }
  >;
  hosts: Record<'kettle' | 'seward' | 'valley' | 'cascade', { orgId: string; slug: string }>;
};

const LISTING_KEYS = [
  'liftOperator',
  'deckhand',
  'orchardPicker',
  'supportAgent',
  'closed',
] as const;
const HOST_KEYS = ['kettle', 'seward', 'valley', 'cascade'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isListing(value: unknown): value is { id: string; slug: string; locationId: string } {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.locationId === 'string'
  );
}

function isHost(value: unknown): value is { orgId: string; slug: string } {
  return isRecord(value) && typeof value.orgId === 'string' && typeof value.slug === 'string';
}

/** The fixtures `pnpm e2e:seed` wrote. */
export function readSeed(): DiscoveryFixtures {
  if (!existsSync(SEED_FILE)) {
    throw new Error('Discovery seed is missing. Run pnpm e2e:seed first.');
  }
  const parsed: unknown = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
  if (!isRecord(parsed) || !isRecord(parsed.listings) || !isRecord(parsed.hosts)) {
    throw new Error('Discovery seed file is incomplete. Run pnpm e2e:seed again.');
  }
  for (const key of LISTING_KEYS) {
    if (!isListing(parsed.listings[key])) {
      throw new Error('Discovery seed file is incomplete. Run pnpm e2e:seed again.');
    }
  }
  for (const key of HOST_KEYS) {
    if (!isHost(parsed.hosts[key])) {
      throw new Error('Discovery seed file is incomplete. Run pnpm e2e:seed again.');
    }
  }
  return parsed as DiscoveryFixtures;
}

type ListingRef = DiscoveryFixtures['listings']['closed'];
type Writes = typeof import('./sp2-writes');

function liftOperator(content: ListingContent): void {
  content.basics.title = 'Lift operator';
}

function nightAuditor(content: ListingContent): void {
  content.basics = { ...content.basics, title: 'Night auditor', occupationCode: 'front_desk_agent' };
  content.job = {
    ...content.job,
    description:
      'Close the nightly books, balance the front desk, and greet late arrivals at the lodge.',
  };
}

function deckhand(content: ListingContent): void {
  content.basics = {
    ...content.basics,
    title: 'Deckhand',
    primaryCategory: 'maritime',
    genre: 'commercial_fishing',
    occupationCode: 'deckhand',
  };
  content.housing = { provided: false };
  content.meals = { provided: false };
  content.genreDetails = {
    category: 'maritime',
    vesselType: 'Seiner',
    homePort: 'Seward',
    rotation: 'Two weeks on, one week off',
    timeAtSea: 'Most of the trip',
    documents: ['twic', 'mmc'],
  };
  content.pay = {
    ...content.pay,
    kind: 'range',
    minCents: 800_000,
    maxCents: 1_200_000,
    unit: 'crew_share',
    crewShareEstimate: { minCents: 800_000, maxCents: 1_200_000, per: 'season' },
    frequency: 'per_trip',
  };
  content.job = {
    ...content.job,
    description:
      'Work the deck on a seiner out of Seward: lines, gear, and the catch, in all weather.',
  };
}

function orchardPicker(content: ListingContent): void {
  content.basics = {
    ...content.basics,
    title: 'Orchard picker',
    primaryCategory: 'farm',
    genre: 'orchards_and_vineyards',
    occupationCode: 'fruit_picker',
  };
  if (content.housing.provided) content.housing.cost = { free: true };
  content.meals = {
    provided: true,
    perDay: 3,
    days: 'every_day',
    cost: { free: true },
    photos: {
      kitchen: '00000000-0000-4000-8000-000000000011',
      meal_example: '00000000-0000-4000-8000-000000000012',
      dining_area: '00000000-0000-4000-8000-000000000013',
      other: '00000000-0000-4000-8000-000000000014',
    },
    note: 'Three meals a day',
    dietary: null,
  };
  content.genreDetails = {
    category: 'farm',
    operationType: 'Orchard',
    harvestWindow: 'Summer',
    equipment: [],
    certifications: [],
  };
  content.pay = {
    ...content.pay,
    minCents: 1800,
    maxCents: 2200,
    unit: 'hour',
    crewShareEstimate: null,
  };
  content.job = {
    ...content.job,
    description: 'Pick fruit in the orchard, keep the rows clean, and pack what you pick for the day.',
  };
}

function supportAgent(content: ListingContent): void {
  content.basics = {
    ...content.basics,
    title: 'Support agent',
    primaryCategory: 'remote',
    genre: 'customer_support',
    occupationCode: 'customer_service_representative',
  };
  if (content.where.mode === 'onsite') {
    content.where = {
      mode: 'remote',
      scope: 'states',
      states: ['CO', 'UT'],
      hostLocationId: content.where.locationId,
    };
  }
  content.housing = { provided: false };
  content.meals = { provided: false };
  content.genreDetails = {
    category: 'remote',
    timeZoneOverlap: 'US Mountain, weekdays',
    equipmentProvided: 'A laptop',
    internet: null,
    travel: 'none',
  };
  content.pay = {
    ...content.pay,
    kind: 'range',
    minCents: 2200,
    maxCents: 2800,
    unit: 'hour',
    crewShareEstimate: null,
    frequency: 'biweekly',
  };
  content.job = {
    ...content.job,
    description: 'Answer customer questions by chat and email, and keep notes the next shift can use.',
  };
}

async function ensureOpen(
  db: Db,
  writes: Writes,
  host: SeedHost,
  title: string,
  edit: (content: ListingContent) => void,
): Promise<ListingRef> {
  const existing = await writes.findListingByTitle(db, host.orgId, title);
  if (existing?.state === 'active') return writes.listingFixture(db, existing.id, title);
  if (existing?.state === 'closed') throw new Error(`e2e seed: ${title} is already closed`);
  if (existing?.state === 'in_review') {
    await writes.drainUntilEmpty(db);
    const again = await writes.findListingByTitle(db, host.orgId, title);
    if (again?.state === 'active') return writes.listingFixture(db, again.id, title);
    throw new Error(`e2e seed: ${title} is still in review`);
  }
  if (existing?.state === 'draft') await writes.discardDraft(db, host, existing.id);
  else if (existing) throw new Error(`e2e seed: ${title} is ${existing.state}`);
  const published = await writes.publishListing(db, host, edit);
  return writes.listingFixture(db, published.id, title);
}

async function ensureClosed(
  db: Db,
  writes: Writes,
  host: SeedHost,
  title: string,
  edit: (content: ListingContent) => void,
): Promise<ListingRef> {
  const existing = await writes.findListingByTitle(db, host.orgId, title);
  if (existing?.state === 'closed') return writes.listingFixture(db, existing.id, title);
  if (existing?.state === 'active') {
    await writes.closeListingAs(db, host, existing.id);
    return writes.listingFixture(db, existing.id, title);
  }
  if (existing?.state === 'in_review') {
    await writes.drainUntilEmpty(db);
    const again = await writes.findListingByTitle(db, host.orgId, title);
    if (again?.state === 'active') {
      await writes.closeListingAs(db, host, again.id);
      return writes.listingFixture(db, again.id, title);
    }
    if (again?.state === 'closed') return writes.listingFixture(db, again.id, title);
    throw new Error(`e2e seed: ${title} is still in review`);
  }
  if (existing?.state === 'draft') await writes.discardDraft(db, host, existing.id);
  else if (existing) throw new Error(`e2e seed: ${title} is ${existing.state}`);
  const published = await writes.publishListing(db, host, edit);
  await writes.closeListingAs(db, host, published.id);
  return writes.listingFixture(db, published.id, title);
}

/** The four hosts and five listings, reused when a later seed finds the same names. */
export async function seedDiscoveryFixtures(db: Db): Promise<DiscoveryFixtures> {
  const writes = await import('./sp2-writes');
  const kettle = await writes.seedHost(db, {
    name: 'Kettle Ridge Lodge',
    city: 'Breckenridge',
    state: 'CO',
    point: { lat: 39.4817, lng: -106.0384 },
    publicPrecision: 'city',
    timezone: 'America/Denver',
  });
  const seward = await writes.seedHost(db, {
    name: 'Seward Fishing Co',
    city: 'Seward',
    state: 'AK',
    point: { lat: 60.1042, lng: -149.4422 },
    publicPrecision: 'exact',
    timezone: 'America/Anchorage',
  });
  const valley = await writes.seedHost(db, {
    name: 'Valley Orchards',
    city: 'Fresno',
    state: 'CA',
    point: { lat: 36.7378, lng: -119.7871 },
    publicPrecision: 'city',
    timezone: 'America/Los_Angeles',
  });
  const cascade = await writes.seedHost(db, {
    name: 'Cascade Support',
    city: 'Bend',
    state: 'OR',
    point: { lat: 44.0582, lng: -121.3153 },
    publicPrecision: 'city',
    timezone: 'America/Los_Angeles',
  });

  const listings = {
    liftOperator: await ensureOpen(db, writes, kettle, 'Lift operator', liftOperator),
    deckhand: await ensureOpen(db, writes, seward, 'Deckhand', deckhand),
    orchardPicker: await ensureOpen(db, writes, valley, 'Orchard picker', orchardPicker),
    supportAgent: await ensureOpen(db, writes, cascade, 'Support agent', supportAgent),
    closed: await ensureClosed(db, writes, kettle, 'Night auditor', nightAuditor),
  };
  await writes.drainUntilEmpty(db);
  return {
    listings,
    hosts: {
      kettle: { orgId: kettle.orgId, slug: kettle.slug },
      seward: { orgId: seward.orgId, slug: seward.slug },
      valley: { orgId: valley.orgId, slug: valley.slug },
      cascade: { orgId: cascade.orgId, slug: cascade.slug },
    },
  };
}
