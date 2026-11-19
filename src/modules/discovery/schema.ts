// Drizzle tables for the discovery module. The DDL lives in drizzle/2000_discovery.sql (the
// projection), 2010_discovery.sql (dispositions and events) and 2020_discovery.sql (saved
// searches). Only tables are exported here: src/db/schema.ts re-exports every module's schema.
//
// `geog` and `search` are opaque to Drizzle: they are written and read through raw SQL only
// (searchVectorSql, ST_MakePoint, ST_Y/ST_X in PROJECTION_SELECT).
import {
  boolean,
  char,
  customType,
  date,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });

/** geography(Point, 4326); read and written through raw SQL only. */
const geography = customType<{ data: string; driverData: string }>({
  dataType: () => 'geography(Point, 4326)',
});

/** tsvector; written with searchVectorSql and matched in raw SQL only. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

export const DISCOVERY_CATEGORY_VALUES = ['maritime', 'seasonal', 'farm', 'remote'] as const;
export const DISCOVERY_SOURCE_VALUES = [
  'seek',
  'swipe',
  'map',
  'invite',
  'boost',
  'landing',
  'other',
] as const;
export const LISTING_EVENT_TYPE_VALUES = ['view', 'save', 'share', 'apply'] as const;
export const SEASON_VALUES = ['spring', 'summer', 'fall', 'winter', 'year_round'] as const;

export const discoveryListings = app.table('discovery_listings', {
  listingId: uuid('listing_id').primaryKey(),
  revisionId: uuid('revision_id').notNull(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  isActive: boolean('is_active').notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  occupationCode: text('occupation_code').notNull(),
  occupationLabel: text('occupation_label').notNull(),
  locationLabel: text('location_label').notNull(),
  city: text('city'),
  genre: text('genre'),
  destinationSlug: text('destination_slug'),
  category: text('category', { enum: DISCOVERY_CATEGORY_VALUES }).notNull(),
  secondaryCategory: text('secondary_category', { enum: DISCOVERY_CATEGORY_VALUES }),
  categories: text('categories', { enum: DISCOVERY_CATEGORY_VALUES }).array().notNull(),
  employmentType: text('employment_type', { enum: ['employee', 'contractor'] }).notNull(),
  hoursType: text('hours_type', { enum: ['full_time', 'part_time'] }).notNull(),
  hostName: text('host_name').notNull(),
  hostSlug: text('host_slug').notNull(),
  hostLogoUrl: text('host_logo_url'),
  hostSince: day('host_since'),
  state: char('state', { length: 2 }).notNull(),
  geog: geography('geog').notNull(),
  approximate: boolean('approximate').notNull(),
  remote: boolean('remote').notNull(),
  remoteStates: text('remote_states').array().notNull().default([]),
  scheduleKind: text('schedule_kind', { enum: ['fixed', 'season', 'ongoing'] }).notNull(),
  startOn: day('start_on'),
  endOn: day('end_on'),
  season: text('season', { enum: SEASON_VALUES }),
  seasonYear: integer('season_year'),
  weeklyHours: numeric('weekly_hours', { precision: 4, scale: 1, mode: 'number' }).notNull(),
  payHourlyMinCents: integer('pay_hourly_min_cents'),
  payHourlyMaxCents: integer('pay_hourly_max_cents'),
  payYearlyMinCents: integer('pay_yearly_min_cents'),
  payChip: text('pay_chip').notNull(),
  payFull: text('pay_full').notNull(),
  payDetails: text('pay_details').array().notNull(),
  housingProvided: boolean('housing_provided').notNull(),
  housingFree: boolean('housing_free').notNull(),
  mealsProvided: boolean('meals_provided').notNull(),
  mealsFree: boolean('meals_free').notNull(),
  sponsorsVisas: boolean('sponsors_visas').notNull(),
  housingCostLine: text('housing_cost_line'),
  housingNote: text('housing_note'),
  mealsCostLine: text('meals_cost_line'),
  mealsNote: text('meals_note'),
  cover: jsonb('cover').$type<{ src: Record<320 | 640 | 1280, string>; alt: string }>(),
  publishedAt: ts('published_at').notNull(),
  firstActiveAt: ts('first_active_at').notNull(),
  indexedAt: ts('indexed_at').notNull(),
  confirmedActiveAt: ts('confirmed_active_at'),
  closedAt: ts('closed_at'),
  search: tsvector('search').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const discoverySyncState = app.table('discovery_sync_state', {
  key: text('key', { enum: ['alerts_match'] }).primaryKey(),
  watermark: ts('watermark').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const listingDispositions = app.table(
  'listing_dispositions',
  {
    /** References app.users(id) on delete cascade. */
    userId: uuid('user_id').notNull(),
    listingId: uuid('listing_id').notNull(),
    state: text('state', { enum: ['saved', 'skipped'] }).notNull(),
    source: text('source', { enum: DISCOVERY_SOURCE_VALUES }).notNull(),
    firstSavedAt: ts('first_saved_at'),
    actedAt: ts('acted_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] })],
);

/** No user id column, ever (spec section 10). */
export const listingEvents = app.table('listing_events', {
  id: uuid('id').primaryKey(),
  listingId: uuid('listing_id').notNull(),
  orgId: uuid('org_id').notNull(),
  type: text('type', { enum: LISTING_EVENT_TYPE_VALUES }).notNull(),
  source: text('source', { enum: DISCOVERY_SOURCE_VALUES }).notNull(),
  viewerHash: text('viewer_hash'),
  dedupeKey: text('dedupe_key').unique(),
  occurredAt: ts('occurred_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const listingEventDaily = app.table(
  'listing_event_daily',
  {
    listingId: uuid('listing_id').notNull(),
    orgId: uuid('org_id').notNull(),
    day: day('day').notNull(),
    type: text('type', { enum: LISTING_EVENT_TYPE_VALUES }).notNull(),
    source: text('source', { enum: DISCOVERY_SOURCE_VALUES }).notNull(),
    count: integer('count').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.day, t.type, t.source] })],
);

export const savedSearches = app.table(
  'saved_searches',
  {
    id: uuid('id').primaryKey(),
    /** References app.users(id) on delete cascade. */
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    query: jsonb('query').$type<Record<string, unknown>>().notNull(),
    queryHash: text('query_hash').notNull(),
    pushEnabled: boolean('push_enabled').notNull().default(true),
    emailDaily: boolean('email_daily').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('saved_searches_user_query_key').on(t.userId, t.queryHash)],
);

export const savedSearchMatches = app.table(
  'saved_search_matches',
  {
    /** References app.saved_searches(id) on delete cascade. */
    savedSearchId: uuid('saved_search_id').notNull(),
    listingId: uuid('listing_id').notNull(),
    matchedAt: ts('matched_at').notNull(),
    pushedAt: ts('pushed_at'),
    dailyEmailedAt: ts('daily_emailed_at'),
    weeklyEmailedAt: ts('weekly_emailed_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.savedSearchId, t.listingId] })],
);

export const alertSettings = app.table('alert_settings', {
  /** References app.users(id) on delete cascade. */
  userId: uuid('user_id').primaryKey(),
  weeklyDigest: boolean('weekly_digest').notNull().default(false),
  pushDay: day('push_day'),
  pushCount: integer('push_count').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
