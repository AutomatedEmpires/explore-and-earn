// Projection rows from SP2 listings (SP3 spec sections 4 and 8.2, plan Task 8):
// - buildProjectionRow maps one published listing, its host and its location to a row. Pure.
// - upsertProjectionRow writes it, keeping the row's first_active_at and clearing closed_at.
// - projectionValuesSql is the VALUES tuple both the upsert and the synthetic seeder write.
//
// Open copy choices (Plan decision 10): the Remote location label is "Remote · US" or
// "Remote · CO, UT" (up to 5 codes, then " +N more"); the housing and meals cost line is
// "Free", "$150/week · deducted from pay" or "$150/week · paid directly".
import { sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import {
  effectiveEnd,
  effectiveStart,
  formatDollars,
  formatPay,
  normalizePay,
  stateByCode,
} from '@/lib/discovery';
import type { Category } from '@/lib/taxonomy';
import type { HostIdentity } from '@/modules/hostpages';
import type { Cost, ListingContent, PublishedListing } from '@/modules/listings';
import type { Location } from '@/modules/locations';
import type { ProjectionRowInput } from './projection-columns';
import { searchVectorSql } from './search-vector';

/** The listing's pay in cents per hour (spec 8.2); SP5's fit score uses it too. */
export function toHourlyCents(c: Pick<ListingContent, 'pay' | 'when'>): {
  minCents: number | null;
  maxCents: number | null;
} {
  const { minCents, maxCents } = normalizePay(c);
  return { minCents, maxCents };
}

/** Everything one projection row is built from. */
export type ProjectionSources = {
  published: PublishedListing;
  host: HostIdentity;
  /** The onsite location, or a Remote listing's host location. */
  location: Location;
  hostLogoUrl: string | null;
  cover: { src: Record<320 | 640 | 1280, string>; alt: string } | null;
  occupationLabel: string;
  genreLabel: string;
  destinationName: string | null;
  now: Date;
};

const CATEGORY_LABELS: Record<Category, string> = {
  maritime: 'Maritime',
  seasonal: 'Seasonal',
  farm: 'Farm',
  remote: 'Remote',
};

/** The int columns hold cents up to 2^31 − 1; absurd pay must not stop a row from syncing. */
const INT_MAX = 2_147_483_647;
const toInt = (n: number | null) => (n === null ? null : Math.min(n, INT_MAX));

const REMOTE_STATES_SHOWN = 5;
const SLUG_MAX = 80;

/** The listing's URL slug: "Lift operator" -> "lift-operator". */
export function listingSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return slug || 'job';
}

/** "Remote · US", "Remote · CO, UT" or "Remote · AK, AZ, CA, CO, ID +2 more". */
export function remoteLabel(states: string[]): string {
  if (states.includes('US')) return 'Remote · US';
  const shown = states.slice(0, REMOTE_STATES_SHOWN).join(', ');
  const more = states.length - REMOTE_STATES_SHOWN;
  return `Remote · ${shown}${more > 0 ? ` +${more} more` : ''}`;
}

/** "Free", "$150/week · deducted from pay" or "$150/week · paid directly". */
export function costLine(cost: Cost): string {
  if (cost.free) return 'Free';
  const paid = cost.paidBy === 'deducted' ? 'deducted from pay' : 'paid directly';
  return `${formatDollars(cost.cents)}/${cost.period} · ${paid}`;
}

const nonEmpty = (s: string | null | undefined) => (s ? s : null);

/** The projection row for an active listing (spec section 4). */
export function buildProjectionRow(i: ProjectionSources): ProjectionRowInput {
  const { published, host, location, now } = i;
  const c = published.content;
  const where = c.where;
  const remote = where.mode === 'remote';
  const remoteStates = remote ? (where.scope === 'all_us' ? ['US'] : [...where.states]) : [];
  const dates = c.when.dates;
  const primary = c.basics.primaryCategory;
  const secondary = c.basics.secondaryCategory;
  const pay = normalizePay(c);
  const display = formatPay(c);
  const housing = c.housing;
  const meals = c.meals;
  const genre = c.basics.genre.replace(/_/g, '-');
  const destinationSlug =
    c.genreDetails.category === 'seasonal' ? c.genreDetails.destinationSlug : null;

  return {
    listingId: published.listingId,
    revisionId: published.revisionId,
    orgId: published.orgId,
    locationId: where.mode === 'remote' ? where.hostLocationId : where.locationId,
    isActive: true,
    slug: listingSlug(c.basics.title),
    title: c.basics.title,
    occupationCode: c.basics.occupationCode,
    occupationLabel: i.occupationLabel,
    locationLabel: remote ? remoteLabel(remoteStates) : `${location.city}, ${location.state}`,
    city: location.city,
    genre,
    destinationSlug,
    category: primary,
    secondaryCategory: secondary,
    categories: secondary && secondary !== primary ? [primary, secondary] : [primary],
    employmentType: c.basics.employmentType,
    hoursType: c.basics.schedule,
    hostName: host.name,
    hostSlug: host.slug,
    hostLogoUrl: i.hostLogoUrl,
    hostSince: host.subscriber ? host.subscriber.hostSince.toISOString().slice(0, 10) : null,
    state: location.state,
    lat: location.publicPoint.lat,
    lng: location.publicPoint.lng,
    approximate: location.publicPrecision === 'city',
    remote,
    remoteStates,
    scheduleKind: dates.mode,
    startOn: effectiveStart(c.when),
    endOn: effectiveEnd(c.when),
    season: dates.mode === 'season' ? dates.season : null,
    seasonYear: dates.mode === 'season' ? dates.year : null,
    weeklyHours: c.when.weeklyHours,
    payHourlyMinCents: toInt(pay.minCents),
    payHourlyMaxCents: toInt(pay.maxCents),
    payYearlyMinCents: toInt(pay.yearlyMinCents),
    payChip: display.chip,
    payFull: display.full,
    payDetails: display.details,
    housingProvided: housing.provided,
    housingFree: housing.provided && housing.cost.free,
    mealsProvided: meals.provided,
    mealsFree: meals.provided && meals.cost.free,
    sponsorsVisas: c.job.visaSponsorship !== 'none',
    housingCostLine: housing.provided ? costLine(housing.cost) : null,
    housingNote: housing.provided ? nonEmpty(housing.note) : null,
    mealsCostLine: meals.provided ? costLine(meals.cost) : null,
    mealsNote: meals.provided ? nonEmpty(meals.note) : null,
    cover: i.cover,
    publishedAt: published.firstPublishedAt,
    firstActiveAt: now,
    indexedAt: now,
    confirmedActiveAt: published.confirmedActiveAt,
    closedAt: null,
    vector: {
      title: c.basics.title,
      occupationLabel: i.occupationLabel,
      hostName: host.name,
      genreLabel: i.genreLabel,
      categoryLabel: CATEGORY_LABELS[primary],
      destinationName: i.destinationName,
      city: location.city,
      stateName: stateByCode(location.state)?.name ?? null,
      description: c.job.description,
    },
  };
}

const textArray = (values: string[]) =>
  sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;

const ts = (d: Date | null) => sql`${d === null ? null : d.toISOString()}::timestamptz`;

/** The columns of projectionValuesSql, in order. */
export const PROJECTION_INSERT_COLUMNS = sql.raw(`listing_id, revision_id, org_id, location_id,
  is_active, slug, title, occupation_code, occupation_label, location_label, city, genre,
  destination_slug, category, secondary_category, categories, employment_type, hours_type,
  host_name, host_slug, host_logo_url, host_since, state, geog, approximate, remote,
  remote_states, schedule_kind, start_on, end_on, season, season_year, weekly_hours,
  pay_hourly_min_cents, pay_hourly_max_cents, pay_yearly_min_cents, pay_chip, pay_full,
  pay_details, housing_provided, housing_free, meals_provided, meals_free, sponsors_visas,
  housing_cost_line, housing_note, meals_cost_line, meals_note, cover, published_at,
  first_active_at, indexed_at, confirmed_active_at, closed_at, search`);

/** One row's VALUES tuple, in PROJECTION_INSERT_COLUMNS order. */
export function projectionValuesSql(r: ProjectionRowInput): SQL {
  return sql`(${r.listingId}::uuid, ${r.revisionId}::uuid, ${r.orgId}::uuid,
    ${r.locationId}::uuid, ${r.isActive}, ${r.slug}, ${r.title}, ${r.occupationCode},
    ${r.occupationLabel}, ${r.locationLabel}, ${r.city}, ${r.genre}, ${r.destinationSlug},
    ${r.category}, ${r.secondaryCategory}, ${textArray(r.categories)}, ${r.employmentType},
    ${r.hoursType}, ${r.hostName}, ${r.hostSlug}, ${r.hostLogoUrl}, ${r.hostSince}::date,
    ${r.state}, ST_SetSRID(ST_MakePoint(${r.lng}::float8, ${r.lat}::float8), 4326)::geography,
    ${r.approximate}, ${r.remote}, ${textArray(r.remoteStates)}, ${r.scheduleKind},
    ${r.startOn}::date, ${r.endOn}::date, ${r.season}, ${r.seasonYear}::int,
    ${r.weeklyHours}::numeric, ${r.payHourlyMinCents}::int, ${r.payHourlyMaxCents}::int,
    ${r.payYearlyMinCents}::int, ${r.payChip}, ${r.payFull}, ${textArray(r.payDetails)},
    ${r.housingProvided}, ${r.housingFree}, ${r.mealsProvided}, ${r.mealsFree},
    ${r.sponsorsVisas}, ${r.housingCostLine}, ${r.housingNote}, ${r.mealsCostLine},
    ${r.mealsNote}, ${r.cover === null ? null : JSON.stringify(r.cover)}::jsonb,
    ${ts(r.publishedAt)}, ${ts(r.firstActiveAt)}, ${ts(r.indexedAt)},
    ${ts(r.confirmedActiveAt)}, ${ts(r.closedAt)}, ${searchVectorSql(r.vector)})`;
}

/** Every column the upsert refreshes: all of them but the key, first_active_at and closed_at. */
const UPDATED_COLUMNS = [
  'revision_id',
  'org_id',
  'location_id',
  'is_active',
  'slug',
  'title',
  'occupation_code',
  'occupation_label',
  'location_label',
  'city',
  'genre',
  'destination_slug',
  'category',
  'secondary_category',
  'categories',
  'employment_type',
  'hours_type',
  'host_name',
  'host_slug',
  'host_logo_url',
  'host_since',
  'state',
  'geog',
  'approximate',
  'remote',
  'remote_states',
  'schedule_kind',
  'start_on',
  'end_on',
  'season',
  'season_year',
  'weekly_hours',
  'pay_hourly_min_cents',
  'pay_hourly_max_cents',
  'pay_yearly_min_cents',
  'pay_chip',
  'pay_full',
  'pay_details',
  'housing_provided',
  'housing_free',
  'meals_provided',
  'meals_free',
  'sponsors_visas',
  'housing_cost_line',
  'housing_note',
  'meals_cost_line',
  'meals_note',
  'cover',
  'published_at',
  'indexed_at',
  'confirmed_active_at',
  'search',
];

const UPDATE_SET = sql.raw(
  [...UPDATED_COLUMNS.map((c) => `${c} = excluded.${c}`), 'closed_at = null'].join(', '),
);

/** Inserts or refreshes the row. An existing row keeps first_active_at; closed_at is cleared. */
export async function upsertProjectionRow(tx: DbOrTx, row: ProjectionRowInput): Promise<void> {
  await tx.execute(sql`
    insert into app.discovery_listings (${PROJECTION_INSERT_COLUMNS})
    values ${projectionValuesSql(row)}
    on conflict (listing_id) do update set ${UPDATE_SET}
  `);
}
