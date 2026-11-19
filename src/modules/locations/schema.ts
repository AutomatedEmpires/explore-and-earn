// Drizzle tables for the locations module (created in drizzle/1100_locations.sql, destinations
// seeded by drizzle/1110_destinations_seed.sql). Only this module reads or writes them; other
// code goes through `@/modules/locations`. Only tables and their value lists are exported here:
// src/db/schema.ts re-exports every module's schema file.
import { sql } from 'drizzle-orm';
import { boolean, customType, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const LOCATION_KINDS = ['business_site', 'port', 'headquarters', 'area'] as const;
export const LOCATION_PRECISIONS = ['exact', 'city'] as const;
export const WEATHER_CONDITIONS = [
  'clear',
  'partly_cloudy',
  'cloudy',
  'rain',
  'snow',
  'storm',
  'fog',
  'wind',
] as const;
export const DESTINATION_KINDS = ['national_park', 'resort_area', 'region', 'other'] as const;

type LatLng = { lat: number; lng: number };

/**
 * Reads a point from hex EWKB, the text form Postgres prints a geography in on both drivers.
 * Returns null for anything that is not a 2D point.
 */
function readEwkbPoint(hex: string): LatLng | null {
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length < 21) return null;
  const le = buf.readUInt8(0) === 1;
  const type = le ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
  if ((type & 0xff) !== 1) return null;
  const at = 5 + (type & 0x20000000 ? 4 : 0);
  if (buf.length < at + 16) return null;
  const lng = le ? buf.readDoubleLE(at) : buf.readDoubleBE(at);
  const lat = le ? buf.readDoubleLE(at + 8) : buf.readDoubleBE(at + 8);
  return { lat, lng };
}

/** A geography(Point, 4326), written from and read as { lat, lng }. */
const geographyPoint = customType<{ data: LatLng; driverData: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
  toDriver(value) {
    return sql`ST_SetSRID(ST_MakePoint(${value.lng}::float8, ${value.lat}::float8), 4326)::geography`;
  },
  fromDriver(value) {
    const point = readEwkbPoint(value);
    if (!point) throw new Error('locations: unreadable geography point');
    return point;
  },
});

export const locations = app.table('locations', {
  id: uuid('id').primaryKey(),
  /** References app.organizations(id). */
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind', { enum: LOCATION_KINDS }).notNull(),
  /** Private unless `publicPrecision` is `exact`. */
  addressLine1: text('address_line1'),
  city: text('city').notNull(),
  /** A code from US_STATE_CODES. */
  state: text('state').notNull(),
  postalCode: text('postal_code'),
  /** The precise point. Private: never leaves host APIs. */
  point: geographyPoint('point').notNull(),
  /** What everyone else sees: rounded to 0.01 degrees for `city` precision. */
  publicPoint: geographyPoint('public_point').notNull(),
  publicPrecision: text('public_precision', { enum: LOCATION_PRECISIONS })
    .notNull()
    .default('city'),
  /** IANA name. */
  timezone: text('timezone').notNull(),
  /** NWS hourly forecast URL, from the points lookup (locations.resolve_nws_grid). */
  nwsForecastUrl: text('nws_forecast_url'),
  archivedAt: ts('archived_at'),
  /** References app.users(id); null after the creator's data is erased. */
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** The latest NWS forecast per location. `failures > 0` hides it from reads. */
export const locationWeather = app.table('location_weather', {
  locationId: uuid('location_id').primaryKey(),
  temperatureF: integer('temperature_f'),
  condition: text('condition', { enum: WEATHER_CONDITIONS }),
  shortForecast: text('short_forecast'),
  periodStart: ts('period_start'),
  fetchedAt: ts('fetched_at'),
  failures: integer('failures').notNull().default(0),
  lastError: text('last_error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** National parks, resort areas and regions (SP3 landing pages, Seasonal listing details). */
export const destinations = app.table('destinations', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: DESTINATION_KINDS }).notNull(),
  states: text('states').array().notNull(),
  point: geographyPoint('point'),
  active: boolean('active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
