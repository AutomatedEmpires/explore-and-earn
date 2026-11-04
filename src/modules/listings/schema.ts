// Drizzle tables for the listings module. The DDL lives in drizzle/1200_listings.sql.
// Only this module reads or writes them; other code goes through `@/modules/listings`.
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });

export const LISTING_STATES = ['draft', 'in_review', 'active', 'closed', 'removed'] as const;
export const REVIEW_STAGES = ['team_approval', 'verification', 'screening', 'moderation'] as const;
export const PROVENANCES = ['host_created', 'imported', 'sourced'] as const;
export const CLOSE_REASONS = ['host', 'end_date', 'downgrade', 'lapsed', 'org_suspended'] as const;
export const REVISION_STATUSES = [
  'screening',
  'in_review',
  'approved',
  'rejected',
  'superseded',
] as const;
export const PHOTO_SLOTS = [
  'bedroom',
  'bathroom',
  'kitchen',
  'exterior',
  'meal_example',
  'dining_area',
  'other',
] as const;
export const PHOTO_SLOT_RESULTS = ['pending', 'match', 'mismatch', 'error'] as const;
export const LINK_DOMAIN_STATUSES = ['allowed', 'blocked', 'unknown'] as const;
export const LINK_DOMAIN_SOURCES = ['web_risk', 'operator', 'rule'] as const;

type GeoPoint = { lat: number; lng: number };

/** Reads a hex EWKB point (how Postgres prints a geography) as { lat, lng }. */
function parseEwkbPoint(hex: string): GeoPoint | null {
  const buf = Buffer.from(hex, 'hex');
  if (buf.length < 21) return null;
  const le = buf.readUInt8(0) === 1;
  const type = le ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
  const at = 5 + (type & 0x20000000 ? 4 : 0);
  if (buf.length < at + 16) return null;
  const lng = le ? buf.readDoubleLE(at) : buf.readDoubleBE(at);
  const lat = le ? buf.readDoubleLE(at + 8) : buf.readDoubleBE(at + 8);
  return { lat, lng };
}

/** A geography(Point, 4326), written from and read as { lat, lng }. */
const geographyPoint = customType<{ data: GeoPoint; driverData: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
  toDriver(value) {
    return sql`ST_SetSRID(ST_MakePoint(${value.lng}::float8, ${value.lat}::float8), 4326)::geography`;
  },
  fromDriver(value) {
    return parseEwkbPoint(value) ?? { lat: 0, lng: 0 };
  },
});

export const occupations = app.table('occupations', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  socCode: text('soc_code').notNull(),
  categories: text('categories').array().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const listings = app.table('listings', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  state: text('state', { enum: LISTING_STATES }).notNull().default('draft'),
  reviewStage: text('review_stage', { enum: REVIEW_STAGES }),
  provenance: text('provenance', { enum: PROVENANCES }).notNull().default('host_created'),
  copiedFromId: uuid('copied_from_id'),
  repostedFromId: uuid('reposted_from_id'),
  /** The builder draft, a DeepPartial<ListingContent>. */
  draft: jsonb('draft').$type<Record<string, unknown>>().notNull().default({}),
  draftVersion: integer('draft_version').notNull().default(0),
  /** Each builder section's version (absent = 0). */
  sectionVersions: jsonb('section_versions')
    .$type<Partial<Record<string, number>>>()
    .notNull()
    .default({}),
  aiFilledFields: text('ai_filled_fields').array().notNull().default([]),
  title: text('title'),
  locationId: uuid('location_id'),
  publishedRevisionId: uuid('published_revision_id'),
  pendingRevisionId: uuid('pending_revision_id'),
  firstPublishedAt: ts('first_published_at'),
  publishedAt: ts('published_at'),
  confirmedActiveAt: ts('confirmed_active_at'),
  nextReminderAt: ts('next_reminder_at'),
  remindersSent: integer('reminders_sent').notNull().default(0),
  autoCloseAt: ts('auto_close_at'),
  closedAt: ts('closed_at'),
  closeReason: text('close_reason', { enum: CLOSE_REASONS }),
  removedAt: ts('removed_at'),
  repostRemindedYear: integer('repost_reminded_year'),
  createdBy: uuid('created_by'),
  lastEditedBy: uuid('last_edited_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const listingRevisions = app.table('listing_revisions', {
  id: uuid('id').primaryKey(),
  listingId: uuid('listing_id').notNull(),
  orgId: uuid('org_id').notNull(),
  revisionNumber: integer('revision_number').notNull(),
  status: text('status', { enum: REVISION_STATUSES }).notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  /** A ListingContent. */
  content: jsonb('content').$type<unknown>().notNull(),
  title: text('title').notNull(),
  primaryCategory: text('primary_category').notNull(),
  secondaryCategory: text('secondary_category'),
  genre: text('genre').notNull(),
  occupationCode: text('occupation_code').notNull(),
  employmentType: text('employment_type').notNull(),
  schedule: text('schedule').notNull(),
  openings: integer('openings').notNull(),
  locationId: uuid('location_id'),
  publicPoint: geographyPoint('public_point'),
  stateCode: text('state_code'),
  remoteScope: text('remote_scope'),
  remoteStates: text('remote_states').array(),
  dateMode: text('date_mode').notNull(),
  startDate: day('start_date'),
  endDate: day('end_date'),
  season: text('season'),
  seasonYear: integer('season_year'),
  weeklyHours: numeric('weekly_hours', { precision: 4, scale: 1, mode: 'number' }).notNull(),
  payKind: text('pay_kind').notNull(),
  payMinCents: integer('pay_min_cents').notNull(),
  payMaxCents: integer('pay_max_cents').notNull(),
  payUnit: text('pay_unit').notNull(),
  crewMinCents: integer('crew_min_cents'),
  crewMaxCents: integer('crew_max_cents'),
  crewPer: text('crew_per'),
  housingProvided: boolean('housing_provided').notNull(),
  housingFree: boolean('housing_free'),
  housingCostCents: integer('housing_cost_cents'),
  housingCostPeriod: text('housing_cost_period'),
  mealsProvided: boolean('meals_provided').notNull(),
  mealsFree: boolean('meals_free'),
  mealsCostCents: integer('meals_cost_cents'),
  mealsCostPeriod: text('meals_cost_period'),
  visaSponsorship: text('visa_sponsorship').notNull(),
  minAge: integer('min_age').notNull(),
  coverMediaId: uuid('cover_media_id'),
  deadline: day('deadline'),
  timezone: text('timezone').notNull(),
  currency: text('currency').notNull().default('USD'),
  /** The screening summary. */
  checks: jsonb('checks').$type<Record<string, unknown>>(),
  acknowledgedWarnings: text('acknowledged_warnings').array().notNull().default([]),
  trustCheckIds: uuid('trust_check_ids').array().notNull().default([]),
  submittedBy: uuid('submitted_by'),
  submittedAt: ts('submitted_at'),
  decidedAt: ts('decided_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const photoSlotChecks = app.table(
  'photo_slot_checks',
  {
    mediaId: uuid('media_id').notNull(),
    slot: text('slot', { enum: PHOTO_SLOTS }).notNull(),
    result: text('result', { enum: PHOTO_SLOT_RESULTS }).notNull().default('pending'),
    checkId: uuid('check_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.slot] })],
);

export const linkDomains = app.table('link_domains', {
  domain: text('domain').primaryKey(),
  status: text('status', { enum: LINK_DOMAIN_STATUSES }).notNull(),
  source: text('source', { enum: LINK_DOMAIN_SOURCES }).notNull(),
  threatTypes: text('threat_types').array().notNull().default([]),
  checkedAt: ts('checked_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
