// The projection row as code reads and writes it (SP3 spec section 4). Reads go through raw SQL
// (`select ${PROJECTION_SELECT} from app.discovery_listings ...`), which returns the same shape
// on PGlite and postgres.js: timestamps as ISO strings, dates as YYYY-MM-DD, numbers as numbers.
import { sql, type SQL } from 'drizzle-orm';
import type { Season } from '@/lib/discovery';
import type { Category } from '@/lib/taxonomy';
import type { SearchVectorFields } from './search-vector';

type Cover = { src: Record<320 | 640 | 1280, string>; alt: string };

/** Every column but `geog` and `search`, plus the point. Timestamps are ISO strings. */
export type ProjectionRow = {
  listingId: string;
  revisionId: string;
  orgId: string;
  locationId: string;
  isActive: boolean;
  slug: string;
  title: string;
  occupationCode: string;
  occupationLabel: string;
  locationLabel: string;
  city: string | null;
  genre: string | null;
  destinationSlug: string | null;
  category: Category;
  secondaryCategory: Category | null;
  categories: Category[];
  employmentType: 'employee' | 'contractor';
  hoursType: 'full_time' | 'part_time';
  hostName: string;
  hostSlug: string;
  hostLogoUrl: string | null;
  /** YYYY-MM-DD. */
  hostSince: string | null;
  state: string;
  lat: number;
  lng: number;
  approximate: boolean;
  remote: boolean;
  remoteStates: string[];
  scheduleKind: 'fixed' | 'season' | 'ongoing';
  /** YYYY-MM-DD. */
  startOn: string | null;
  /** YYYY-MM-DD. */
  endOn: string | null;
  season: Season | null;
  seasonYear: number | null;
  weeklyHours: number;
  payHourlyMinCents: number | null;
  payHourlyMaxCents: number | null;
  payYearlyMinCents: number | null;
  payChip: string;
  payFull: string;
  payDetails: string[];
  housingProvided: boolean;
  housingFree: boolean;
  mealsProvided: boolean;
  mealsFree: boolean;
  sponsorsVisas: boolean;
  housingCostLine: string | null;
  housingNote: string | null;
  mealsCostLine: string | null;
  mealsNote: string | null;
  cover: Cover | null;
  publishedAt: string;
  firstActiveAt: string;
  indexedAt: string;
  confirmedActiveAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * What a writer supplies for one row: every column but `geog`, `search` and the
 * created/updated stamps, plus the point and the search document's fields.
 */
export type ProjectionRowInput = Omit<
  ProjectionRow,
  | 'publishedAt'
  | 'firstActiveAt'
  | 'indexedAt'
  | 'confirmedActiveAt'
  | 'closedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  publishedAt: Date;
  firstActiveAt: Date;
  indexedAt: Date;
  confirmedActiveAt: Date | null;
  closedAt: Date | null;
  vector: SearchVectorFields;
};

/** A timestamptz as an ISO string ('2026-06-01T04:30:00.000Z'), whatever the session zone. */
const iso = (column: string) =>
  `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** [expression over table alias `t`, ProjectionRow key]. */
const COLUMNS: [(t: string) => string, keyof ProjectionRow][] = [
  [(t) => `${t}.listing_id::text`, 'listingId'],
  [(t) => `${t}.revision_id::text`, 'revisionId'],
  [(t) => `${t}.org_id::text`, 'orgId'],
  [(t) => `${t}.location_id::text`, 'locationId'],
  [(t) => `${t}.is_active`, 'isActive'],
  [(t) => `${t}.slug`, 'slug'],
  [(t) => `${t}.title`, 'title'],
  [(t) => `${t}.occupation_code`, 'occupationCode'],
  [(t) => `${t}.occupation_label`, 'occupationLabel'],
  [(t) => `${t}.location_label`, 'locationLabel'],
  [(t) => `${t}.city`, 'city'],
  [(t) => `${t}.genre`, 'genre'],
  [(t) => `${t}.destination_slug`, 'destinationSlug'],
  [(t) => `${t}.category`, 'category'],
  [(t) => `${t}.secondary_category`, 'secondaryCategory'],
  [(t) => `${t}.categories`, 'categories'],
  [(t) => `${t}.employment_type`, 'employmentType'],
  [(t) => `${t}.hours_type`, 'hoursType'],
  [(t) => `${t}.host_name`, 'hostName'],
  [(t) => `${t}.host_slug`, 'hostSlug'],
  [(t) => `${t}.host_logo_url`, 'hostLogoUrl'],
  [(t) => `${t}.host_since::text`, 'hostSince'],
  [(t) => `${t}.state::text`, 'state'],
  [(t) => `ST_Y(${t}.geog::geometry)`, 'lat'],
  [(t) => `ST_X(${t}.geog::geometry)`, 'lng'],
  [(t) => `${t}.approximate`, 'approximate'],
  [(t) => `${t}.remote`, 'remote'],
  [(t) => `${t}.remote_states`, 'remoteStates'],
  [(t) => `${t}.schedule_kind`, 'scheduleKind'],
  [(t) => `${t}.start_on::text`, 'startOn'],
  [(t) => `${t}.end_on::text`, 'endOn'],
  [(t) => `${t}.season`, 'season'],
  [(t) => `${t}.season_year`, 'seasonYear'],
  [(t) => `${t}.weekly_hours::float8`, 'weeklyHours'],
  [(t) => `${t}.pay_hourly_min_cents`, 'payHourlyMinCents'],
  [(t) => `${t}.pay_hourly_max_cents`, 'payHourlyMaxCents'],
  [(t) => `${t}.pay_yearly_min_cents`, 'payYearlyMinCents'],
  [(t) => `${t}.pay_chip`, 'payChip'],
  [(t) => `${t}.pay_full`, 'payFull'],
  [(t) => `${t}.pay_details`, 'payDetails'],
  [(t) => `${t}.housing_provided`, 'housingProvided'],
  [(t) => `${t}.housing_free`, 'housingFree'],
  [(t) => `${t}.meals_provided`, 'mealsProvided'],
  [(t) => `${t}.meals_free`, 'mealsFree'],
  [(t) => `${t}.sponsors_visas`, 'sponsorsVisas'],
  [(t) => `${t}.housing_cost_line`, 'housingCostLine'],
  [(t) => `${t}.housing_note`, 'housingNote'],
  [(t) => `${t}.meals_cost_line`, 'mealsCostLine'],
  [(t) => `${t}.meals_note`, 'mealsNote'],
  [(t) => `${t}.cover`, 'cover'],
  [(t) => iso(`${t}.published_at`), 'publishedAt'],
  [(t) => iso(`${t}.first_active_at`), 'firstActiveAt'],
  [(t) => iso(`${t}.indexed_at`), 'indexedAt'],
  [(t) => iso(`${t}.confirmed_active_at`), 'confirmedActiveAt'],
  [(t) => iso(`${t}.closed_at`), 'closedAt'],
  [(t) => iso(`${t}.created_at`), 'createdAt'],
  [(t) => iso(`${t}.updated_at`), 'updatedAt'],
];

/**
 * The ProjectionRow column list for a query whose FROM names the projection `alias`
 * (`from app.discovery_listings dl` -> projectionSelect('dl')).
 */
export function projectionSelect(alias: string): SQL {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error(`projectionSelect: bad alias ${alias}`);
  return sql.raw(COLUMNS.map(([expr, key]) => `${expr(alias)} as "${key}"`).join(', '));
}

/** The ProjectionRow column list for `from app.discovery_listings` (no alias). */
export const PROJECTION_SELECT: SQL = projectionSelect('discovery_listings');
