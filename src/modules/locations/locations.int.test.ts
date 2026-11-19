// Runs against a real Postgres (CI's postgis service, already migrated by `pnpm db:migrate`).
// postgres.js prints geography and arrays differently from PGlite's driver, so this checks the
// geography point type, the weather cache and the destinations seed on the production driver.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeClient, createDb } from '@/lib/db';
import { seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import { listDestinations } from './destinations';
import { resolveNwsGrid } from './jobs';
import { createLocation, getLocations, listHostLocations } from './service';
import { getWeather, stubWeather } from './weather';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);
const orgs: SeededOrg[] = [];

afterAll(async () => {
  for (const o of orgs) {
    await db.execute(
      sql`update app.organizations set primary_location_id = null where id = ${o.orgId}`,
    );
    await db.execute(
      sql`delete from app.location_weather where location_id in
        (select id from app.locations where org_id = ${o.orgId})`,
    );
    await db.execute(sql`delete from app.locations where org_id = ${o.orgId}`);
    await db.execute(sql`delete from app.org_memberships where org_id = ${o.orgId}`);
    await db.execute(sql`delete from app.org_slugs where org_id = ${o.orgId}`);
    await db.execute(sql`delete from app.organizations where id = ${o.orgId}`);
    await db.execute(sql`delete from app.users where id = ${o.owner.userId}`);
  }
  await closeClient(db);
});

const noGeocoder = {
  async geocode(): Promise<never> {
    throw new Error('geocoder should not be called');
  },
};

describe('locations on postgres.js', () => {
  it('writes and reads geography points, the weather cache and destinations', async () => {
    const org = await seedHostOrg(db, { name: `Int Harbor ${Date.now()}` });
    orgs.push(org);
    const created = await createLocation(
      db,
      org.owner.ctx,
      {
        name: 'Harbor dock',
        kind: 'port',
        address: { line1: '1 Harbor Rd', city: 'Seward', state: 'AK' },
        point: { lat: 60.10423, lng: -149.44217 },
        publicPrecision: 'city',
      },
      noGeocoder,
    );

    expect((await getLocations(db, [created.id])).get(created.id)?.publicPoint).toEqual({
      lat: 60.1,
      lng: -149.44,
    });
    const [host] = await listHostLocations(db, org.orgId);
    expect(host?.point).toEqual({ lat: 60.10423, lng: -149.44217 });

    const now = new Date();
    await resolveNwsGrid(db, created.id, { provider: stubWeather(), now });
    expect((await getWeather(db, [created.id], now)).get(created.id)).toMatchObject({
      temperatureF: 54,
      condition: 'partly_cloudy',
    });

    const destinations = await listDestinations(db);
    expect(destinations.length).toBeGreaterThanOrEqual(78);
    expect(destinations.find((d) => d.slug === 'yellowstone')?.states).toEqual(['WY', 'MT', 'ID']);
  });
});
