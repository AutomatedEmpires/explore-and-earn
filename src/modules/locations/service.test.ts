// Locations: validation, geocoding, public-point privacy, the home location, events and audit,
// and the host routes (Task 20). Sibling SP2 modules (orgs, listings) are W0 fakes.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE as deleteRoute, PATCH as patchRoute } from '@/app/api/v1/host/locations/[id]/route';
import { POST as geocodeRoute } from '@/app/api/v1/host/locations/geocode/route';
import { GET as listRoute, POST as createRoute } from '@/app/api/v1/host/locations/route';
import { queryRows, type Db } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { requireHost } from '@/server/guards';
import { listingsFake } from '../../../tests/fakes/sp2/listings';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import {
  buildListingContent,
  seedHostOrg,
  seedMember,
  type SeededOrg,
} from '../../../tests/helpers/sp2';
import type { Geocoder } from './geocoder';
import { privacyHandlers } from './privacy';
import { toPublicPoint } from './public-point';
import {
  archiveLocation,
  createLocation,
  getLocations,
  listOrgLocations,
  updateLocation,
  type LocationInput,
} from './service';

const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
vi.mock('@/lib/db', async (orig) => ({
  ...(await orig<typeof import('@/lib/db')>()),
  getDb: () => {
    if (!dbHolder.current) throw new Error('test db not ready');
    return dbHolder.current;
  },
}));
vi.mock('@/server/guards', () => ({
  requireUser: vi.fn(),
  requireSeeker: vi.fn(),
  requireHost: vi.fn(),
  requireOperator: vi.fn(),
}));
vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('../../../tests/fakes/sp2/listings')).listingsFake,
}));

let t: TestDb;
let org: SeededOrg;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  listingsFake.reset();
  vi.mocked(requireHost).mockReset();
  org = await seedHostOrg(t.db);
});

/** A geocoder that must not be called (the input has a point). */
const noGeocoder: Geocoder = {
  async geocode() {
    throw new Error('geocoder should not be called');
  },
};

const base: LocationInput = {
  name: 'Harbor dock',
  kind: 'port',
  address: { line1: '1 Harbor Rd', city: 'Seward', state: 'AK', postalCode: '99664' },
  point: { lat: 60.10423, lng: -149.44217 },
  publicPrecision: 'city',
};

async function errorOf(
  p: Promise<unknown>,
): Promise<{ code: string; message: string; details: unknown }> {
  try {
    await p;
  } catch (err) {
    if (isAppError(err)) return { code: err.code, message: err.message, details: err.details };
    throw err;
  }
  throw new Error('expected an AppError');
}

async function primaryLocationOf(orgId: string): Promise<string | null> {
  const [row] = await queryRows<{ primary_location_id: string | null }>(
    t.db,
    sql`select primary_location_id from app.organizations where id = ${orgId}`,
  );
  return row?.primary_location_id ?? null;
}

async function privateRow(id: string) {
  const [row] = await queryRows<{
    lat: number;
    lng: number;
    address_line1: string | null;
    timezone: string;
    created_by: string | null;
  }>(
    t.db,
    sql`
      select ST_Y(point::geometry) as lat, ST_X(point::geometry) as lng, address_line1, timezone,
        created_by
      from app.locations where id = ${id}
    `,
  );
  return row;
}

describe('toPublicPoint', () => {
  it('rounds both coordinates to 0.01 degrees for city precision and keeps exact ones', () => {
    expect(toPublicPoint({ lat: 60.10423, lng: -149.44217 }, 'city')).toEqual({
      lat: 60.1,
      lng: -149.44,
    });
    expect(toPublicPoint({ lat: 21.30694, lng: -157.85833 }, 'city')).toEqual({
      lat: 21.31,
      lng: -157.86,
    });
    expect(toPublicPoint({ lat: 60.10423, lng: -149.44217 }, 'exact')).toEqual({
      lat: 60.10423,
      lng: -149.44217,
    });
  });
});

describe('createLocation', () => {
  it('shows only a rounded point and no street address for city precision', async () => {
    const location = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    expect(location).toMatchObject({
      orgId: org.orgId,
      name: 'Harbor dock',
      kind: 'port',
      city: 'Seward',
      state: 'AK',
      publicPoint: { lat: 60.1, lng: -149.44 },
      publicPrecision: 'city',
      publicAddressLine1: null,
      timezone: 'America/Anchorage',
      archived: false,
    });
    // The private point and the street address are stored, but stay out of `Location`.
    expect(await privateRow(location.id)).toMatchObject({
      lat: 60.10423,
      lng: -149.44217,
      address_line1: '1 Harbor Rd',
      created_by: org.owner.userId,
    });
    expect((await getLocations(t.db, [location.id])).get(location.id)).toEqual({
      id: location.id,
      orgId: org.orgId,
      name: 'Harbor dock',
      kind: 'port',
      city: 'Seward',
      state: 'AK',
      publicPoint: { lat: 60.1, lng: -149.44 },
      publicPrecision: 'city',
      publicAddressLine1: null,
      timezone: 'America/Anchorage',
      archived: false,
    });
  });

  it('shows the exact point and the street address for exact precision', async () => {
    const location = await createLocation(
      t.db,
      org.owner.ctx,
      { ...base, publicPrecision: 'exact' },
      noGeocoder,
    );
    expect(location.publicPoint).toEqual({ lat: 60.10423, lng: -149.44217 });
    expect(location.publicAddressLine1).toBe('1 Harbor Rd');
  });

  it('accepts the 50 states, DC and the territories, and nothing else', async () => {
    const xx = await errorOf(
      createLocation(
        t.db,
        org.owner.ctx,
        { ...base, address: { ...base.address, state: 'XX' } },
        noGeocoder,
      ),
    );
    expect(xx.code).toBe('bad_request');
    expect(xx.details).toMatchObject({ reason: 'invalid_state' });

    const guam = await createLocation(
      t.db,
      org.owner.ctx,
      {
        ...base,
        address: { city: 'Hagåtña', state: 'GU' },
        point: { lat: 13.4757, lng: 144.7489 },
      },
      noGeocoder,
    );
    expect(guam.state).toBe('GU');
    expect(guam.timezone).toBe('Pacific/Guam');
  });

  it('checks the timezone is a real IANA name', async () => {
    const mars = await errorOf(
      createLocation(t.db, org.owner.ctx, { ...base, timezone: 'Mars/Base' }, noGeocoder),
    );
    expect(mars.code).toBe('bad_request');
    expect(mars.details).toMatchObject({ reason: 'invalid_timezone' });

    const chosen = await createLocation(
      t.db,
      org.owner.ctx,
      { ...base, timezone: 'America/Los_Angeles' },
      noGeocoder,
    );
    expect(chosen.timezone).toBe('America/Los_Angeles');
  });

  it('trims the name and rejects an empty or over-long one', async () => {
    expect(
      (await createLocation(t.db, org.owner.ctx, { ...base, name: '  Dock  ' }, noGeocoder)).name,
    ).toBe('Dock');
    for (const name of ['   ', 'x'.repeat(81)]) {
      expect(
        (await errorOf(createLocation(t.db, org.owner.ctx, { ...base, name }, noGeocoder))).code,
      ).toBe('bad_request');
    }
  });

  it('geocodes the address when there is no point, and asks for a pin when nothing matches', async () => {
    const { point: _point, ...noPoint } = base;
    const geocoded = await createLocation(t.db, org.owner.ctx, noPoint);
    // The stub geocoder (GEOCODER_PROVIDER=stub) answers with a fixed point near Seward.
    expect(await privateRow(geocoded.id)).toMatchObject({ lat: 60.1042, lng: -149.4422 });

    const miss = await errorOf(
      createLocation(t.db, org.owner.ctx, {
        ...noPoint,
        address: { ...noPoint.address, line1: '__nomatch__ 1 Harbor Rd' },
      }),
    );
    expect(miss).toEqual({
      code: 'bad_request',
      message: 'Drop a pin on the map instead',
      details: { reason: 'geocode_failed' },
    });

    const noStreet = await errorOf(
      createLocation(t.db, org.owner.ctx, { ...noPoint, address: { city: 'Seward', state: 'AK' } }),
    );
    expect(noStreet.details).toEqual({ reason: 'geocode_failed' });
  });

  it('emits location.updated and records locations.created', async () => {
    const location = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    const events = await queryRows<{ payload: { event: string; data: unknown } }>(
      t.db,
      sql`select payload from app.outbox where topic = 'locations.resolve_nws_grid'
        and payload -> 'data' ->> 'locationId' = ${location.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      event: 'location.updated',
      data: { locationId: location.id, orgId: org.orgId },
    });

    const audit = await queryRows<{ actor_id: string; org_id: string; subject_type: string }>(
      t.db,
      sql`select actor_id, org_id, subject_type from app.audit_events
        where action = 'locations.created' and subject_id = ${location.id}`,
    );
    expect(audit).toEqual([
      { actor_id: org.owner.userId, org_id: org.orgId, subject_type: 'location' },
    ]);
  });

  it("makes the org's first location its home location, and leaves it for later ones", async () => {
    expect(await primaryLocationOf(org.orgId)).toBeNull();
    const first = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    expect(await primaryLocationOf(org.orgId)).toBe(first.id);
    await createLocation(t.db, org.owner.ctx, { ...base, name: 'Lodge' }, noGeocoder);
    expect(await primaryLocationOf(org.orgId)).toBe(first.id);
  });
});

describe('updateLocation', () => {
  it('changes fields, re-derives the public point, emits location.updated and records audit', async () => {
    const location = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    const updated = await updateLocation(
      t.db,
      org.owner.ctx,
      location.id,
      { name: 'Small boat harbor', publicPrecision: 'exact' },
      noGeocoder,
    );
    expect(updated).toMatchObject({
      name: 'Small boat harbor',
      publicPrecision: 'exact',
      publicPoint: { lat: 60.10423, lng: -149.44217 },
      publicAddressLine1: '1 Harbor Rd',
    });

    const events = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox where topic = 'locations.resolve_nws_grid'
        and payload -> 'data' ->> 'locationId' = ${location.id}`,
    );
    expect(events[0]?.n).toBe(2);
    const audit = await queryRows<{ data: { changed: string[] } }>(
      t.db,
      sql`select data from app.audit_events
        where action = 'locations.updated' and subject_id = ${location.id}`,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.data.changed.sort()).toEqual(['name', 'publicPrecision']);
  });

  it('re-geocodes a changed address without a point, and keeps the point otherwise', async () => {
    const location = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    await updateLocation(t.db, org.owner.ctx, location.id, { name: 'Dock' }, noGeocoder);
    expect(await privateRow(location.id)).toMatchObject({ lat: 60.10423, lng: -149.44217 });

    const geocoder: Geocoder = {
      geocode: async () => [{ lat: 61.2181, lng: -149.9003, matched: '2 Main St, Anchorage, AK' }],
    };
    await updateLocation(
      t.db,
      org.owner.ctx,
      location.id,
      { address: { line1: '2 Main St', city: 'Anchorage', state: 'AK' } },
      geocoder,
    );
    expect(await privateRow(location.id)).toMatchObject({
      lat: 61.2181,
      lng: -149.9003,
      address_line1: '2 Main St',
    });
    expect((await getLocations(t.db, [location.id])).get(location.id)?.publicPoint).toEqual({
      lat: 61.22,
      lng: -149.9,
    });
  });

  it('moves a default timezone with the state, and keeps one the host chose', async () => {
    const moved = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    const inWa = await updateLocation(
      t.db,
      org.owner.ctx,
      moved.id,
      { address: { city: 'Leavenworth', state: 'WA' }, point: { lat: 47.5962, lng: -120.6615 } },
      noGeocoder,
    );
    expect(inWa.timezone).toBe('America/Los_Angeles');

    const chosen = await createLocation(
      t.db,
      org.owner.ctx,
      { ...base, timezone: 'America/Denver' },
      noGeocoder,
    );
    const kept = await updateLocation(
      t.db,
      org.owner.ctx,
      chosen.id,
      { address: { city: 'Leavenworth', state: 'WA' }, point: { lat: 47.5962, lng: -120.6615 } },
      noGeocoder,
    );
    expect(kept.timezone).toBe('America/Denver');
  });

  it("returns not_found for another org's location or an archived one", async () => {
    const other = await seedHostOrg(t.db, { name: 'Other Outfit' });
    const theirs = await createLocation(t.db, other.owner.ctx, base, noGeocoder);
    expect(
      (await errorOf(updateLocation(t.db, org.owner.ctx, theirs.id, { name: 'Mine' }, noGeocoder)))
        .code,
    ).toBe('not_found');

    const mine = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    await archiveLocation(t.db, org.owner.ctx, mine.id);
    expect(
      (await errorOf(updateLocation(t.db, org.owner.ctx, mine.id, { name: 'Again' }, noGeocoder)))
        .code,
    ).toBe('not_found');
  });
});

describe('archiveLocation', () => {
  it('clears the home location only when it pointed at the archived location', async () => {
    const first = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    const second = await createLocation(
      t.db,
      org.owner.ctx,
      { ...base, name: 'Lodge' },
      noGeocoder,
    );

    await archiveLocation(t.db, org.owner.ctx, second.id);
    expect(await primaryLocationOf(org.orgId)).toBe(first.id);

    await archiveLocation(t.db, org.owner.ctx, first.id);
    expect(await primaryLocationOf(org.orgId)).toBeNull();

    const audit = await queryRows<{ subject_id: string }>(
      t.db,
      sql`select subject_id from app.audit_events where action = 'locations.archived'
        and org_id = ${org.orgId} order by created_at`,
    );
    expect(audit.map((a) => a.subject_id)).toEqual([second.id, first.id]);
  });

  it('keeps archived locations readable by id but out of the org list', async () => {
    const kept = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    const gone = await createLocation(
      t.db,
      org.owner.ctx,
      { ...base, name: 'Old dock' },
      noGeocoder,
    );
    await archiveLocation(t.db, org.owner.ctx, gone.id);

    expect((await listOrgLocations(t.db, org.orgId)).map((l) => l.id)).toEqual([kept.id]);
    expect((await getLocations(t.db, [gone.id, newId()])).get(gone.id)?.archived).toBe(true);
    expect((await getLocations(t.db, [gone.id, newId()])).size).toBe(1);
  });

  it("returns not_found for another org's location", async () => {
    const other = await seedHostOrg(t.db, { name: 'Other Outfit' });
    const theirs = await createLocation(t.db, other.owner.ctx, base, noGeocoder);
    expect((await errorOf(archiveLocation(t.db, org.owner.ctx, theirs.id))).code).toBe('not_found');
    expect((await getLocations(t.db, [theirs.id])).get(theirs.id)?.archived).toBe(false);
  });
});

describe('privacyHandlers', () => {
  it('exports the locations a user created and erases them as the creator', async () => {
    const location = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    expect(await privacyHandlers.export(t.db, org.owner.userId)).toEqual({
      locationsCreated: [{ id: location.id, orgId: org.orgId, name: 'Harbor dock' }],
    });
    await privacyHandlers.erase(t.db, org.owner.userId);
    expect((await privateRow(location.id))?.created_by).toBeNull();
    expect(await privacyHandlers.export(t.db, org.owner.userId)).toEqual({ locationsCreated: [] });
  });
});

describe('host location routes', () => {
  const URL_BASE = 'http://localhost:3000/api/v1/host/locations';

  function request(method: string, path = '', body?: unknown): Request {
    return new Request(`${URL_BASE}${path}`, {
      method,
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  async function json<T>(res: Response): Promise<T> {
    return (await res.json()) as T;
  }

  it('creates, lists and edits locations for an Owner', async () => {
    vi.mocked(requireHost).mockResolvedValue(org.owner.ctx);
    const created = await createRoute(
      request('POST', '', { ...base, address: { ...base.address, state: 'ak' } }),
    );
    expect(created.status).toBe(200);
    const location = await json<{ id: string; state: string; address: { line1: string } }>(created);
    expect(location.state).toBe('AK');
    // Host APIs also carry the private address and point, so the editor can show them.
    expect(location.address.line1).toBe('1 Harbor Rd');

    const listed = await json<{ id: string }[]>(await listRoute(request('GET')));
    expect(listed.map((l) => l.id)).toEqual([location.id]);

    const patched = await patchRoute(
      request('PATCH', `/${location.id}`, { name: 'Dock' }),
      params(location.id),
    );
    expect(patched.status).toBe(200);
    expect((await json<{ name: string }>(patched)).name).toBe('Dock');
  });

  it("answers 404 for another org's location", async () => {
    const other = await seedHostOrg(t.db, { name: 'Other Outfit' });
    const theirs = await createLocation(t.db, other.owner.ctx, base, noGeocoder);
    vi.mocked(requireHost).mockResolvedValue(org.owner.ctx);

    const patched = await patchRoute(
      request('PATCH', `/${theirs.id}`, { name: 'Mine' }),
      params(theirs.id),
    );
    expect(patched.status).toBe(404);
    const deleted = await deleteRoute(request('DELETE', `/${theirs.id}`), params(theirs.id));
    expect(deleted.status).toBe(404);
    expect(listingsFake.calls.filter((c) => c.name === 'countActiveByLocation')).toHaveLength(0);

    const listed = await json<{ id: string }[]>(await listRoute(request('GET')));
    expect(listed.map((l) => l.id)).not.toContain(theirs.id);
  });

  it('refuses to archive a location an active listing uses, and archives it otherwise', async () => {
    vi.mocked(requireHost).mockResolvedValue(org.owner.ctx);
    const location = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    const listingId = newId();
    listingsFake.setListing({
      listingId,
      revisionId: newId(),
      orgId: org.orgId,
      content: buildListingContent({
        locationId: location.id,
        coverMediaId: newId(),
        housingPhotos: { bedroom: newId(), bathroom: newId(), kitchen: newId(), exterior: newId() },
      }),
      firstPublishedAt: new Date('2026-10-01T00:00:00Z'),
      publishedAt: new Date('2026-10-01T00:00:00Z'),
      confirmedActiveAt: null,
      autoCloseAt: null,
      applicationsCloseAt: null,
      provenance: 'host_created',
    });

    const inUse = await deleteRoute(request('DELETE', `/${location.id}`), params(location.id));
    expect(inUse.status).toBe(409);
    expect((await json<{ error: { details: unknown } }>(inUse)).error.details).toEqual({
      reason: 'location_in_use',
    });

    listingsFake.reset();
    const archived = await deleteRoute(request('DELETE', `/${location.id}`), params(location.id));
    expect(archived.status).toBe(200);
    expect(await json(archived)).toEqual({ ok: true });
    expect((await getLocations(t.db, [location.id])).get(location.id)?.archived).toBe(true);
  });

  it('shows an assigned Recruiter only their locations, and keeps them from editing', async () => {
    const a = await createLocation(t.db, org.owner.ctx, base, noGeocoder);
    await createLocation(t.db, org.owner.ctx, { ...base, name: 'Lodge' }, noGeocoder);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    await t.db.execute(sql`
      insert into app.member_assignments (id, membership_id, location_id)
      values (${newId()}, ${recruiter.membershipId}, ${a.id})
    `);
    vi.mocked(requireHost).mockResolvedValue(recruiter.ctx);

    const listed = await json<{ id: string }[]>(await listRoute(request('GET')));
    expect(listed.map((l) => l.id)).toEqual([a.id]);

    const created = await createRoute(request('POST', '', base));
    expect(created.status).toBe(403);
    expect((await json<{ error: { details: unknown } }>(created)).error.details).toEqual({
      reason: 'role_not_allowed',
    });

    const allScope = await seedMember(t.db, org.orgId, 'recruiter');
    vi.mocked(requireHost).mockResolvedValue(allScope.ctx);
    expect(await json<unknown[]>(await listRoute(request('GET')))).toHaveLength(2);
  });

  it('keeps Billing members out of locations', async () => {
    const billing = await seedMember(t.db, org.orgId, 'billing');
    vi.mocked(requireHost).mockResolvedValue(billing.ctx);
    expect((await listRoute(request('GET'))).status).toBe(403);
  });

  it('geocodes an address for the picker', async () => {
    vi.mocked(requireHost).mockResolvedValue(org.owner.ctx);
    const res = await geocodeRoute(
      request('POST', '/geocode', { line1: '1 Harbor Rd', city: 'Seward', state: 'AK' }),
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      candidates: [{ lat: 60.1042, lng: -149.4422, matched: '1 Harbor Rd, Seward, AK' }],
    });

    const miss = await geocodeRoute(
      request('POST', '/geocode', { line1: '__nomatch__', city: 'Seward', state: 'AK' }),
    );
    expect(await json(miss)).toEqual({ candidates: [] });

    const badState = await geocodeRoute(
      request('POST', '/geocode', { line1: '1 Harbor Rd', city: 'Seward', state: 'XX' }),
    );
    expect(badState.status).toBe(400);
  });

  it('turns a geocoder miss into 400 geocode_failed', async () => {
    vi.mocked(requireHost).mockResolvedValue(org.owner.ctx);
    const { point: _point, ...noPoint } = base;
    const res = await createRoute(
      request('POST', '', { ...noPoint, address: { ...noPoint.address, line1: '__nomatch__' } }),
    );
    expect(res.status).toBe(400);
    expect((await json<{ error: { message: string; details: unknown } }>(res)).error).toMatchObject(
      {
        message: 'Drop a pin on the map instead',
        details: { reason: 'geocode_failed' },
      },
    );
  });
});
