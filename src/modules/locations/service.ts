// Host locations (SP2 Task 20): create, edit and archive, with geocoding, the public-point
// privacy rule and the org's home location. Each change emits `location.updated` (the NWS grid
// lookup listens) and is audited, in the same transaction.
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryRows, type Db, type DbOrTx } from '@/lib/db';
import { badRequest, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { isUSStateCode, STATE_DEFAULT_TIMEZONE, type USStateCode } from '@/lib/us-states';
import { record } from '@/modules/audit';
import { emit } from '@/modules/jobs';
import type { HostContext } from '@/server/guards';
import { getGeocoder, type GeocodeCandidate, type Geocoder } from './geocoder';
import { toPublicPoint, type LatLng, type PublicPrecision } from './public-point';
import { LOCATION_KINDS, LOCATION_PRECISIONS, locations } from './schema';
import type { HostLocation, Location, LocationKind } from './types';

export type LocationAddressInput = {
  line1?: string;
  city: string;
  state: string;
  postalCode?: string;
};

export type LocationInput = {
  name: string;
  kind: LocationKind;
  address: LocationAddressInput;
  /** A dropped pin. Without one, the address is geocoded. */
  point?: LatLng;
  publicPrecision: PublicPrecision;
  /** IANA name; defaults to the state's (STATE_DEFAULT_TIMEZONE). */
  timezone?: string;
};

/** An edit: only the fields given change. A new address without a point is geocoded again. */
export type LocationPatch = Partial<LocationInput>;

// Input schemas (routes) ---------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : undefined));

const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const addressSchema = z.object({
  line1: optionalText(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(10),
  postalCode: optionalText(10),
});

const inputFields = {
  name: z.string().max(200),
  kind: z.enum(LOCATION_KINDS),
  address: addressSchema,
  point: latLngSchema.nullish().transform((v) => v ?? undefined),
  publicPrecision: z.enum(LOCATION_PRECISIONS),
  timezone: optionalText(100),
};

/** POST /host/locations. `publicPrecision` defaults to `city`. */
export const locationInputSchema = z.object({
  ...inputFields,
  publicPrecision: inputFields.publicPrecision.default('city'),
});

/** PATCH /host/locations/[id]: every field optional, nothing defaulted. */
export const locationPatchSchema = z.object(inputFields).partial();

/** POST /host/locations/geocode. */
export const geocodeInputSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(10),
  postalCode: optionalText(10),
});

const latLngJson = z.object({ lat: z.number(), lng: z.number() });

/** The JSON shape of a HostLocation (OpenAPI output). */
export const hostLocationJsonSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  name: z.string(),
  kind: z.enum(LOCATION_KINDS),
  city: z.string(),
  state: z.string(),
  publicPoint: latLngJson,
  publicPrecision: z.enum(LOCATION_PRECISIONS),
  publicAddressLine1: z.string().nullable(),
  timezone: z.string(),
  archived: z.boolean(),
  address: z.object({
    line1: z.string().nullable(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string().nullable(),
  }),
  point: latLngJson,
});

// Rules --------------------------------------------------------------------------------------

const MAX_NAME = 80;

const geocodeFailed = () =>
  badRequest('Drop a pin on the map instead', { reason: 'geocode_failed' });

function checkName(name: string): string {
  const trimmed = name.trim();
  const length = [...trimmed].length;
  if (length < 1 || length > MAX_NAME) {
    throw badRequest(`Give the location a name of 1 to ${MAX_NAME} characters`, {
      reason: 'invalid_name',
    });
  }
  return trimmed;
}

function checkState(state: string): USStateCode {
  const code = state.trim().toUpperCase();
  if (!isUSStateCode(code)) {
    throw badRequest('Choose a US state or territory', { reason: 'invalid_state' });
  }
  return code;
}

/** The canonical IANA name, or 400 `invalid_timezone`. */
export function checkTimezone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timeZone.trim() }).resolvedOptions()
      .timeZone;
  } catch {
    throw badRequest('Choose a valid time zone', { reason: 'invalid_timezone' });
  }
}

function checkPoint(p: LatLng): LatLng {
  const ok =
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180;
  if (!ok) throw badRequest('That point is not on the map', { reason: 'invalid_point' });
  return { lat: p.lat, lng: p.lng };
}

type Address = {
  line1: string | null;
  city: string;
  state: USStateCode;
  postalCode: string | null;
};

function checkAddress(a: LocationAddressInput): Address {
  const city = a.city.trim();
  if (city === '' || city.length > 100) {
    throw badRequest('Enter the city', { reason: 'invalid_address' });
  }
  const line1 = a.line1?.trim() || null;
  const postalCode = a.postalCode?.trim() || null;
  if ((line1 && line1.length > 200) || (postalCode && postalCode.length > 10)) {
    throw badRequest('That address is too long', { reason: 'invalid_address' });
  }
  return { line1, city, state: checkState(a.state), postalCode };
}

const sameAddress = (a: Address, b: Address) =>
  a.line1 === b.line1 && a.city === b.city && a.state === b.state && a.postalCode === b.postalCode;

async function geocodeOne(address: Address, geocoder: Geocoder): Promise<LatLng> {
  if (!address.line1) throw geocodeFailed();
  const [first] = await geocoder.geocode({
    line1: address.line1,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode ?? undefined,
  });
  if (!first) throw geocodeFailed();
  return checkPoint({ lat: first.lat, lng: first.lng });
}

/** Candidates for the location picker. An empty list means "Drop a pin on the map instead". */
export async function geocodeAddress(
  a: { line1: string; city: string; state: string; postalCode?: string },
  geocoder: Geocoder = getGeocoder(),
): Promise<{ candidates: GeocodeCandidate[] }> {
  const address = checkAddress(a);
  if (!address.line1) return { candidates: [] };
  const candidates = await geocoder.geocode({
    line1: address.line1,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode ?? undefined,
  });
  return { candidates };
}

// Rows ---------------------------------------------------------------------------------------

type Row = typeof locations.$inferSelect;

const publicColumns = {
  id: locations.id,
  orgId: locations.orgId,
  name: locations.name,
  kind: locations.kind,
  addressLine1: locations.addressLine1,
  city: locations.city,
  state: locations.state,
  publicPoint: locations.publicPoint,
  publicPrecision: locations.publicPrecision,
  timezone: locations.timezone,
  archivedAt: locations.archivedAt,
};

type PublicRow = Pick<Row, keyof typeof publicColumns>;

function toLocation(r: PublicRow): Location {
  return {
    id: r.id,
    orgId: r.orgId,
    name: r.name,
    kind: r.kind,
    city: r.city,
    state: r.state,
    publicPoint: r.publicPoint,
    publicPrecision: r.publicPrecision,
    publicAddressLine1: r.publicPrecision === 'exact' ? r.addressLine1 : null,
    timezone: r.timezone,
    archived: r.archivedAt !== null,
  };
}

function toHostLocation(r: Row): HostLocation {
  return {
    ...toLocation(r),
    address: { line1: r.addressLine1, city: r.city, state: r.state, postalCode: r.postalCode },
    point: r.point,
  };
}

/** Locations by id, archived ones included (`archived: true`). Unknown ids are left out. */
export async function getLocations(db: DbOrTx, ids: string[]): Promise<Map<string, Location>> {
  const out = new Map<string, Location>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const rows = await db.select(publicColumns).from(locations).where(inArray(locations.id, unique));
  for (const r of rows) out.set(r.id, toLocation(r));
  return out;
}

/** The org's live (not archived) locations, oldest first. */
export async function listOrgLocations(db: DbOrTx, orgId: string): Promise<Location[]> {
  const rows = await db
    .select(publicColumns)
    .from(locations)
    .where(and(eq(locations.orgId, orgId), isNull(locations.archivedAt)))
    .orderBy(asc(locations.createdAt), asc(locations.id));
  return rows.map(toLocation);
}

/** The org's live locations with their private fields, for the org's own host APIs. */
export async function listHostLocations(db: DbOrTx, orgId: string): Promise<HostLocation[]> {
  const rows = await db
    .select()
    .from(locations)
    .where(and(eq(locations.orgId, orgId), isNull(locations.archivedAt)))
    .orderBy(asc(locations.createdAt), asc(locations.id));
  return rows.map(toHostLocation);
}

async function loadLive(db: DbOrTx, orgId: string, id: string): Promise<Row> {
  const [row] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.orgId, orgId), isNull(locations.archivedAt)));
  if (!row) throw notFound('Location not found');
  return row;
}

// Changes ------------------------------------------------------------------------------------

/**
 * Adds a location to the caller's org. Without a point the address is geocoded; no match is
 * 400 `geocode_failed`. The org's first location becomes its home location.
 */
export async function createLocation(
  db: Db,
  ctx: HostContext,
  i: LocationInput,
  geocoder: Geocoder = getGeocoder(),
): Promise<HostLocation> {
  const name = checkName(i.name);
  const address = checkAddress(i.address);
  const timezone =
    i.timezone === undefined ? STATE_DEFAULT_TIMEZONE[address.state] : checkTimezone(i.timezone);
  const point = i.point ? checkPoint(i.point) : await geocodeOne(address, geocoder);
  const id = newId();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(locations)
      .values({
        id,
        orgId: ctx.orgId,
        name,
        kind: i.kind,
        addressLine1: address.line1,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        point,
        publicPoint: toPublicPoint(point, i.publicPrecision),
        publicPrecision: i.publicPrecision,
        timezone,
        createdBy: ctx.user.id,
      })
      .returning();
    if (!row) throw new Error('createLocation: insert returned no row');

    // The home location (Task 32). Locations can't import orgs, so this is one guarded update.
    await queryRows(
      tx,
      sql`
        update app.organizations set primary_location_id = ${id}
        where id = ${ctx.orgId} and primary_location_id is null
        returning id
      `,
    );
    await emit(tx, 'location.updated', { locationId: id, orgId: ctx.orgId }, newId());
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: ctx.orgId,
      action: 'locations.created',
      subjectType: 'location',
      subjectId: id,
      data: { name, kind: i.kind, city: address.city, state: address.state },
    });
    return toHostLocation(row);
  });
}

/** Edits one of the caller's live locations; another org's or an archived one is 404. */
export async function updateLocation(
  db: Db,
  ctx: HostContext,
  id: string,
  i: LocationPatch,
  geocoder: Geocoder = getGeocoder(),
): Promise<HostLocation> {
  const current = await loadLive(db, ctx.orgId, id);
  const before: Address = {
    line1: current.addressLine1,
    city: current.city,
    state: checkState(current.state),
    postalCode: current.postalCode,
  };

  const name = i.name === undefined ? current.name : checkName(i.name);
  const kind = i.kind ?? current.kind;
  const address = i.address === undefined ? before : checkAddress(i.address);
  const precision = i.publicPrecision ?? current.publicPrecision;

  let point = current.point;
  if (i.point) point = checkPoint(i.point);
  else if (!sameAddress(address, before)) point = await geocodeOne(address, geocoder);

  let timezone = current.timezone;
  if (i.timezone !== undefined) timezone = checkTimezone(i.timezone);
  else if (
    address.state !== before.state &&
    current.timezone === STATE_DEFAULT_TIMEZONE[before.state]
  ) {
    timezone = STATE_DEFAULT_TIMEZONE[address.state];
  }

  const changed: string[] = [];
  if (name !== current.name) changed.push('name');
  if (kind !== current.kind) changed.push('kind');
  if (!sameAddress(address, before)) changed.push('address');
  if (point.lat !== current.point.lat || point.lng !== current.point.lng) changed.push('point');
  if (precision !== current.publicPrecision) changed.push('publicPrecision');
  if (timezone !== current.timezone) changed.push('timezone');
  if (changed.length === 0) return toHostLocation(current);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(locations)
      .set({
        name,
        kind,
        addressLine1: address.line1,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        point,
        publicPoint: toPublicPoint(point, precision),
        publicPrecision: precision,
        timezone,
      })
      .where(
        and(eq(locations.id, id), eq(locations.orgId, ctx.orgId), isNull(locations.archivedAt)),
      )
      .returning();
    if (!row) throw notFound('Location not found');

    await emit(tx, 'location.updated', { locationId: id, orgId: ctx.orgId }, newId());
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: ctx.orgId,
      action: 'locations.updated',
      subjectType: 'location',
      subjectId: id,
      data: { changed },
    });
    return toHostLocation(row);
  });
}

/**
 * Archives one of the caller's locations (archiving it again changes nothing). When it was the
 * org's home location, the org has none until another is chosen. Callers check first that no
 * active listing uses it (DELETE /host/locations/[id]).
 */
export async function archiveLocation(db: Db, ctx: HostContext, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const archived = await tx
      .update(locations)
      .set({ archivedAt: new Date() })
      .where(
        and(eq(locations.id, id), eq(locations.orgId, ctx.orgId), isNull(locations.archivedAt)),
      )
      .returning({ id: locations.id });
    if (archived.length === 0) {
      const [existing] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, id), eq(locations.orgId, ctx.orgId)));
      if (!existing) throw notFound('Location not found');
      return;
    }

    await queryRows(
      tx,
      sql`
        update app.organizations set primary_location_id = null
        where id = ${ctx.orgId} and primary_location_id = ${id}
        returning id
      `,
    );
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: ctx.orgId,
      action: 'locations.archived',
      subjectType: 'location',
      subjectId: id,
    });
  });
}
