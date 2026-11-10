// Synthetic projection rows for the performance gate (SP3 spec 11, plan Task 11). Rows only,
// straight into app.discovery_listings: no SP2 listing, host or location exists behind them, so
// this never runs in prod.
//
// The data is deterministic for a seed (a mulberry32 PRNG; ids are UUIDv7-shaped strings drawn
// from it) and for the UTC day it is written on, since publish and start dates are spread
// around that day: published over the last 90 days, starting over the next 9 months.
// - About count / 4.2 locations (about 12,000 for 50,000 listings), weighted by state
//   population, with one host per 20 listings.
// - Seasonal 40%, Farm 25%, Remote 20%, Maritime 15%. Remote work is 30% overall: every Remote
//   listing and one in eight of the others.
// - Mixed pay units (hour, day, week, month, season, year and maritime crew shares), fixed,
//   season and ongoing schedules, housing on about 30%.
import { sql } from 'drizzle-orm';
import { withTx, type Db } from '@/lib/db';
import {
  effectiveEnd,
  effectiveStart,
  formatPay,
  normalizePay,
  stateByCode,
  type Season,
} from '@/lib/discovery';
import { getEnv } from '@/lib/env';
import { GENRES, type Category } from '@/lib/taxonomy';
import type { ListingContent } from '@/modules/listings';
import {
  PROJECTION_INSERT_COLUMNS,
  costLine,
  listingSlug,
  projectionValuesSql,
  remoteLabel,
} from './projection';
import type { ProjectionRowInput } from './projection-columns';

const BATCH_ROWS = 1000;
/** Rows per INSERT statement, well under Postgres's 65,535 parameters. */
const STATEMENT_ROWS = 250;
const DAY_MS = 86_400_000;
const LISTINGS_PER_LOCATION = 4.2;
const LISTINGS_PER_HOST = 20;

/** 2020 Census resident population in thousands, for the 50 states and DC. */
const POPULATION: Record<string, number> = {
  AL: 5024,
  AK: 733,
  AZ: 7152,
  AR: 3012,
  CA: 39538,
  CO: 5774,
  CT: 3606,
  DE: 990,
  DC: 690,
  FL: 21538,
  GA: 10712,
  HI: 1455,
  ID: 1839,
  IL: 12812,
  IN: 6786,
  IA: 3190,
  KS: 2938,
  KY: 4506,
  LA: 4658,
  ME: 1362,
  MD: 6177,
  MA: 7030,
  MI: 10077,
  MN: 5706,
  MS: 2961,
  MO: 6155,
  MT: 1084,
  NE: 1962,
  NV: 3105,
  NH: 1378,
  NJ: 9289,
  NM: 2118,
  NY: 20201,
  NC: 10439,
  ND: 779,
  OH: 11799,
  OK: 3959,
  OR: 4237,
  PA: 13003,
  RI: 1097,
  SC: 5119,
  SD: 887,
  TN: 6911,
  TX: 29146,
  UT: 3272,
  VT: 643,
  VA: 8631,
  WA: 7705,
  WV: 1794,
  WI: 5894,
  WY: 577,
};

const TITLES: Record<Category, string[]> = {
  maritime: ['Deckhand', 'Seafood processor', 'Galley cook', 'Marine engineer', 'Tour boat crew'],
  seasonal: ['Lift operator', 'Housekeeper', 'Line cook', 'River guide', 'Camp counselor'],
  farm: ['Farmworker', 'Harvest picker', 'Ranch hand', 'Equipment operator', 'Greenhouse worker'],
  remote: [
    'Customer support agent',
    'Sales representative',
    'Software developer',
    'Content writer',
    'Virtual assistant',
  ],
};

const CATEGORY_LABELS: Record<Category, string> = {
  maritime: 'Maritime',
  seasonal: 'Seasonal',
  farm: 'Farm',
  remote: 'Remote',
};

type Rand = () => number;

/** mulberry32: a small, fast, seedable PRNG. */
function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

function pick<T>(rand: Rand, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error('seedSynthetic: empty choice');
  return item;
}

/** A UUIDv7-shaped id whose timestamp is `ms` and whose other bits come from `rand`. */
function uuidFrom(rand: Rand, ms: number): string {
  const bytes = new Uint8Array(16);
  let t = Math.max(0, Math.floor(ms));
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }
  for (let i = 6; i < 16; i++) bytes[i] = Math.floor(rand() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Host = { id: string; name: string; slug: string; since: string | null };
type Place = {
  id: string;
  host: Host;
  state: string;
  city: string;
  lat: number;
  lng: number;
  approximate: boolean;
};

function weightedStates(): { code: string; upTo: number }[] {
  let total = 0;
  return Object.entries(POPULATION).map(([code, n]) => {
    total += n;
    return { code, upTo: total };
  });
}

function makePlaces(rand: Rand, count: number, anchorMs: number): Place[] {
  const hosts: Host[] = Array.from(
    { length: Math.max(1, Math.round(count / LISTINGS_PER_HOST)) },
    (_, k) => ({
      id: uuidFrom(rand, anchorMs - (k + 1) * 60_000),
      name: `Synthetic Host ${k + 1}`,
      slug: `synthetic-host-${k + 1}`,
      since: rand() < 0.6 ? isoDay(anchorMs - int(rand, 30, 700) * DAY_MS) : null,
    }),
  );
  const states = weightedStates();
  const total = states[states.length - 1]?.upTo ?? 1;
  return Array.from({ length: Math.max(1, Math.round(count / LISTINGS_PER_LOCATION)) }, (_, k) => {
    const r = rand() * total;
    const code = states.find((s) => r < s.upTo)?.code ?? 'CO';
    const centroid = stateByCode(code)?.centroid ?? { lat: 39.5, lng: -105.2 };
    return {
      id: uuidFrom(rand, anchorMs - (k + 1) * 1000),
      host: pick(rand, hosts),
      state: code,
      city: `Town ${k + 1}`,
      lat: Math.round((centroid.lat + (rand() - 0.5) * 2) * 1e5) / 1e5,
      lng: Math.round((centroid.lng + (rand() - 0.5) * 2) * 1e5) / 1e5,
      approximate: rand() < 0.5,
    };
  });
}

function category(rand: Rand): Category {
  const r = rand();
  if (r < 0.4) return 'seasonal';
  if (r < 0.65) return 'farm';
  if (r < 0.85) return 'remote';
  return 'maritime';
}

function schedule(rand: Rand, anchorMs: number): ListingContent['when']['dates'] {
  const r = rand();
  const startMs = anchorMs + int(rand, 0, 270) * DAY_MS;
  if (r < 0.6) {
    return {
      mode: 'fixed',
      start: isoDay(startMs),
      end: isoDay(startMs + int(rand, 30, 180) * DAY_MS),
    };
  }
  if (r < 0.85) {
    const year = new Date(anchorMs).getUTCFullYear() + int(rand, 0, 1);
    const season: Season =
      rand() < 0.05 ? 'year_round' : pick(rand, ['spring', 'summer', 'fall', 'winter'] as const);
    return { mode: 'season', season, year };
  }
  return { mode: 'ongoing', start: rand() < 0.3 ? null : isoDay(startMs - 30 * DAY_MS) };
}

const PAY_RANGES: Record<Exclude<ListingContent['pay']['unit'], 'crew_share'>, [number, number]> = {
  hour: [1500, 3500],
  day: [12_000, 30_000],
  week: [60_000, 150_000],
  month: [250_000, 600_000],
  season: [800_000, 2_000_000],
  year: [3_000_000, 9_000_000],
};

function pay(rand: Rand, cat: Category): ListingContent['pay'] {
  const base = {
    overtime: rand() < 0.3,
    tips: rand() < 0.15,
    bonuses: rand() < 0.1 ? 'End-of-season bonus' : null,
    frequency: pick(rand, ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const),
    deductions: null,
  };
  if (cat === 'maritime' && rand() < 0.2) {
    const min = int(rand, 500_000, 1_500_000);
    return {
      ...base,
      kind: 'range',
      minCents: 0,
      maxCents: 0,
      unit: 'crew_share',
      crewShareEstimate: {
        minCents: min,
        maxCents: min + int(rand, 100_000, 600_000),
        per: 'season',
      },
    };
  }
  const r = rand();
  const unit = r < 0.5 ? 'hour' : pick(rand, ['day', 'week', 'month', 'season', 'year'] as const);
  const [lo, hi] = PAY_RANGES[unit];
  const step = unit === 'hour' ? 25 : 1000;
  const min = Math.round(int(rand, lo, hi) / step) * step;
  const range = rand() < 0.4;
  return {
    ...base,
    kind: range ? 'range' : 'fixed',
    minCents: min,
    maxCents: range ? min + Math.round((min * int(rand, 5, 30)) / 100 / step) * step : min,
    unit,
    crewShareEstimate: null,
  };
}

function cost(
  rand: Rand,
): { free: true } | { free: false; cents: number; period: 'week'; paidBy: 'deducted' | 'direct' } {
  return rand() < 0.3
    ? { free: true }
    : {
        free: false,
        cents: int(rand, 5, 30) * 1000,
        period: 'week',
        paidBy: rand() < 0.7 ? 'deducted' : 'direct',
      };
}

function row(rand: Rand, places: Place[], anchorMs: number): ProjectionRowInput {
  const place = pick(rand, places);
  const cat = category(rand);
  const remote = cat === 'remote' || rand() < 0.125;
  const genre = pick(
    rand,
    GENRES.filter((g) => g.category === cat),
  );
  const title = pick(rand, TITLES[cat]);
  const when: ListingContent['when'] = {
    dates: schedule(rand, anchorMs),
    weeklyHours: pick(rand, [20, 30, 40, 48, 60]),
    minCommitment: null,
  };
  const p = pay(rand, cat);
  const normalized = normalizePay({ pay: p, when });
  const display = formatPay({ pay: p, when });
  const housing = rand() < 0.3 ? cost(rand) : null;
  const meals = rand() < 0.2 ? cost(rand) : null;
  const remoteStates = !remote ? [] : rand() < 0.6 ? ['US'] : [place.state];
  const publishedAt = new Date(anchorMs - Math.floor(rand() * 90 * DAY_MS));
  const st = stateByCode(place.state);
  const dates = when.dates;

  return {
    listingId: uuidFrom(rand, publishedAt.getTime()),
    revisionId: uuidFrom(rand, publishedAt.getTime()),
    orgId: place.host.id,
    locationId: place.id,
    isActive: true,
    slug: listingSlug(title),
    title,
    occupationCode: listingSlug(title).replace(/-/g, '_'),
    occupationLabel: title,
    locationLabel: remote ? remoteLabel(remoteStates) : `${place.city}, ${place.state}`,
    city: place.city,
    genre: genre.code.replace(/_/g, '-'),
    destinationSlug: null,
    category: cat,
    secondaryCategory: null,
    categories: [cat],
    employmentType: rand() < 0.9 ? 'employee' : 'contractor',
    hoursType: when.weeklyHours >= 30 ? 'full_time' : 'part_time',
    hostName: place.host.name,
    hostSlug: place.host.slug,
    hostLogoUrl: null,
    hostSince: place.host.since,
    state: place.state,
    lat: place.lat,
    lng: place.lng,
    approximate: place.approximate,
    remote,
    remoteStates,
    scheduleKind: dates.mode,
    startOn: effectiveStart(when),
    endOn: effectiveEnd(when),
    season: dates.mode === 'season' ? dates.season : null,
    seasonYear: dates.mode === 'season' ? dates.year : null,
    weeklyHours: when.weeklyHours,
    payHourlyMinCents: normalized.minCents,
    payHourlyMaxCents: normalized.maxCents,
    payYearlyMinCents: normalized.yearlyMinCents,
    payChip: display.chip,
    payFull: display.full,
    payDetails: display.details,
    housingProvided: housing !== null,
    housingFree: housing?.free ?? false,
    mealsProvided: meals !== null,
    mealsFree: meals?.free ?? false,
    sponsorsVisas: rand() < 0.1,
    housingCostLine: housing ? costLine(housing) : null,
    housingNote: null,
    mealsCostLine: meals ? costLine(meals) : null,
    mealsNote: null,
    cover: null,
    publishedAt,
    firstActiveAt: publishedAt,
    indexedAt: new Date(anchorMs),
    confirmedActiveAt: null,
    closedAt: null,
    vector: {
      title,
      occupationLabel: title,
      hostName: place.host.name,
      genreLabel: genre.label,
      categoryLabel: CATEGORY_LABELS[cat],
      destinationName: null,
      city: place.city,
      stateName: st?.name ?? null,
      description: `${title} with ${place.host.name}. ${genre.label} work in ${st?.name ?? place.state}.`,
    },
  };
}

/**
 * Writes `count` deterministic projection rows in batches of 1,000; throws when APP_ENV=prod.
 * `now` (default: the current time) fixes the UTC day the dates are spread around.
 */
export async function seedSynthetic(
  db: Db,
  i: { count: number; seed: number; now?: Date },
): Promise<void> {
  if (getEnv().APP_ENV === 'prod') throw new Error('seedSynthetic is not allowed in prod');
  const count = Math.max(0, Math.floor(i.count));
  if (count === 0) return;
  const now = i.now ?? new Date();
  const anchorMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const rand = mulberry32(i.seed);
  const places = makePlaces(rand, count, anchorMs);

  for (let start = 0; start < count; start += BATCH_ROWS) {
    const batch = Array.from({ length: Math.min(BATCH_ROWS, count - start) }, () =>
      row(rand, places, anchorMs),
    );
    await withTx(db, async (tx) => {
      for (let k = 0; k < batch.length; k += STATEMENT_ROWS) {
        const chunk = batch.slice(k, k + STATEMENT_ROWS);
        await tx.execute(sql`
          insert into app.discovery_listings (${PROJECTION_INSERT_COLUMNS})
          values ${sql.join(chunk.map(projectionValuesSql), sql`, `)}
        `);
      }
    });
  }
}
