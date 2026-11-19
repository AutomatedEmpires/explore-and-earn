// NWS weather: the provider, condition mapping, the grid lookup on location.updated, the
// 30-minute refresh and the staleness rules (Task 21).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { runWorker } from '@/modules/jobs';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { FIXED_NOW, seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import hourly from './fixtures/nws-forecast-hourly.json';
import points from './fixtures/nws-points.json';
import { jobHandlers, refreshWeather, resolveNwsGrid } from './jobs';
import { archiveLocation, createLocation, type LocationInput } from './service';
import {
  clearWeatherOrgFilters,
  getWeather,
  mapCondition,
  nwsWeather,
  registerWeatherOrgFilter,
  stubWeather,
  type WeatherProvider,
} from './weather';

vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
}));

const UA = 'Explore&Earn (support@exploreandearn.com)';
const HOURLY_URL = 'https://api.weather.gov/gridpoints/AFC/152,155/forecast/hourly';
const MINUTE = 60_000;

let t: TestDb;
let org: SeededOrg;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  clearWeatherOrgFilters();
  await t.db.execute(sql`delete from app.outbox`);
  org = await seedHostOrg(t.db);
});

const noGeocoder = {
  async geocode(): Promise<never> {
    throw new Error('geocoder should not be called');
  },
};

const seward: LocationInput = {
  name: 'Harbor dock',
  kind: 'port',
  address: { line1: '1 Harbor Rd', city: 'Seward', state: 'AK' },
  point: { lat: 60.10423, lng: -149.44217 },
  publicPrecision: 'city',
};

/** A location in Washington at the Seward point, so the NWS zone differs from the state's. */
const inWashington = (o: Partial<LocationInput> = {}): LocationInput => ({
  ...seward,
  address: { line1: '1 Harbor Rd', city: 'Leavenworth', state: 'WA' },
  ...o,
});

async function create(db: Db, o: SeededOrg, input: LocationInput = seward) {
  return createLocation(db, o.owner.ctx, input, noGeocoder);
}

type Call = { url: URL; headers: Headers };

/** A fetch that answers the NWS points and hourly endpoints from the fixtures. */
function nwsFetch(o: { pointsStatus?: number; hourly?: unknown } = {}) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    calls.push({ url, headers: new Headers(init?.headers) });
    if (url.pathname.startsWith('/points/')) {
      if (o.pointsStatus && o.pointsStatus !== 200) {
        return Response.json({ title: 'Not Found' }, { status: o.pointsStatus });
      }
      return Response.json(points);
    }
    if (url.pathname.endsWith('/forecast/hourly')) return Response.json(o.hourly ?? hourly);
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;
  return { fn, calls };
}

async function weatherRow(locationId: string) {
  const [row] = await queryRows<{
    temperature_f: number | null;
    condition: string | null;
    short_forecast: string | null;
    failures: number;
    last_error: string | null;
  }>(
    t.db,
    sql`select temperature_f, condition, short_forecast, failures, last_error
      from app.location_weather where location_id = ${locationId}`,
  );
  return row ?? null;
}

async function locationRow(id: string) {
  const [row] = await queryRows<{ nws_forecast_url: string | null; timezone: string }>(
    t.db,
    sql`select nws_forecast_url, timezone from app.locations where id = ${id}`,
  );
  return row;
}

const failing: WeatherProvider = {
  async points() {
    return { forecastHourlyUrl: HOURLY_URL, timeZone: 'America/Anchorage' };
  },
  async firstHourlyPeriod() {
    throw new Error('NWS answered 503');
  },
};

describe('mapCondition', () => {
  it.each([
    ['Partly Sunny', 'partly_cloudy'],
    ['Mostly Sunny', 'partly_cloudy'],
    ['Partly Cloudy', 'partly_cloudy'],
    ['Mostly Cloudy', 'cloudy'],
    ['Overcast', 'cloudy'],
    ['Chance Rain Showers', 'rain'],
    ['Patchy Drizzle', 'rain'],
    ['Slight Chance Thunderstorms', 'storm'],
    ['Chance Showers And Thunderstorms', 'storm'],
    ['Snow Likely', 'snow'],
    ['Rain And Snow Showers', 'snow'],
    ['Flurries', 'snow'],
    ['Patchy Fog', 'fog'],
    ['Haze', 'fog'],
    ['Areas Of Smoke', 'fog'],
    ['Breezy', 'wind'],
    ['Sunny And Windy', 'wind'],
    ['Sunny', 'clear'],
    ['Mostly Clear', 'clear'],
    ['Hot', 'cloudy'],
  ] as const)('%s → %s', (forecast, condition) => {
    expect(mapCondition(forecast)).toBe(condition);
  });
});

describe('nwsWeather', () => {
  it('looks up the grid with 4-decimal coordinates and the configured User-Agent', async () => {
    const f = nwsFetch();
    const grid = await nwsWeather(UA, { fetch: f.fn }).points(60.10423, -149.44217);
    expect(grid).toEqual({ forecastHourlyUrl: HOURLY_URL, timeZone: 'America/Anchorage' });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.url.href).toBe('https://api.weather.gov/points/60.1042,-149.4422');
    expect(f.calls[0]?.headers.get('user-agent')).toBe(UA);
  });

  it('answers null when NWS has no grid for the point (404)', async () => {
    const f = nwsFetch({ pointsStatus: 404 });
    expect(await nwsWeather(UA, { fetch: f.fn }).points(13.4757, 144.7489)).toBeNull();
  });

  it('throws on other HTTP errors, so the failure is counted', async () => {
    const f = nwsFetch({ pointsStatus: 500 });
    await expect(nwsWeather(UA, { fetch: f.fn }).points(60.1, -149.4)).rejects.toThrow(/500/);
  });

  it('reads the first hourly period, converting Celsius', async () => {
    const f = nwsFetch();
    const nws = nwsWeather(UA, { fetch: f.fn });
    expect(await nws.firstHourlyPeriod(HOURLY_URL)).toEqual({
      temperatureF: 38,
      shortForecast: 'Slight Chance Rain Showers',
      startTime: new Date('2026-11-03T17:00:00Z'),
    });
    expect(f.calls[0]?.headers.get('user-agent')).toBe(UA);

    const celsius = nwsFetch({
      hourly: {
        properties: {
          periods: [
            {
              startTime: '2026-11-03T08:00:00-09:00',
              temperature: { unitCode: 'wmoUnit:degC', value: 12.2 },
              shortForecast: 'Sunny',
            },
          ],
        },
      },
    });
    expect(
      (await nwsWeather(UA, { fetch: celsius.fn }).firstHourlyPeriod(HOURLY_URL)).temperatureF,
    ).toBe(54);
  });

  it('only fetches forecasts from api.weather.gov', async () => {
    const f = nwsFetch();
    await expect(
      nwsWeather(UA, { fetch: f.fn }).firstHourlyPeriod('https://evil.example/forecast/hourly'),
    ).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
});

describe('locations.resolve_nws_grid', () => {
  it("stores the forecast URL and takes NWS's timezone while the state default is in use", async () => {
    const location = await create(t.db, org, inWashington());
    expect((await locationRow(location.id))?.timezone).toBe('America/Los_Angeles');

    await resolveNwsGrid(t.db, location.id, { provider: nwsWeather(UA, { fetch: nwsFetch().fn }) });
    expect(await locationRow(location.id)).toEqual({
      nws_forecast_url: HOURLY_URL,
      timezone: 'America/Anchorage',
    });
  });

  it('keeps a timezone the host chose', async () => {
    const location = await create(t.db, org, inWashington({ timezone: 'America/Denver' }));
    await resolveNwsGrid(t.db, location.id, { provider: nwsWeather(UA, { fetch: nwsFetch().fn }) });
    expect(await locationRow(location.id)).toEqual({
      nws_forecast_url: HOURLY_URL,
      timezone: 'America/Denver',
    });
  });

  it('counts a point with no NWS grid as a failure and resolves', async () => {
    const location = await create(t.db, org);
    const provider = nwsWeather(UA, { fetch: nwsFetch({ pointsStatus: 404 }).fn });
    await expect(resolveNwsGrid(t.db, location.id, { provider })).resolves.toBeUndefined();
    expect((await locationRow(location.id))?.nws_forecast_url).toBeNull();
    expect((await weatherRow(location.id))?.failures).toBe(1);
  });

  it('counts a failing first fetch, keeps the grid and resolves', async () => {
    const location = await create(t.db, org);
    await expect(resolveNwsGrid(t.db, location.id, { provider: failing })).resolves.toBeUndefined();
    expect((await locationRow(location.id))?.nws_forecast_url).toBe(HOURLY_URL);
    expect(await weatherRow(location.id)).toMatchObject({
      failures: 1,
      last_error: 'NWS answered 503',
      temperature_f: null,
    });
  });

  it('shows weather for a new location after one worker drain, with no refresh', async () => {
    const location = await create(t.db, org);
    await runWorker(t.db, { handlers: jobHandlers });

    const weather = (await getWeather(t.db, [location.id])).get(location.id);
    expect(weather).toMatchObject({
      temperatureF: 54,
      condition: 'partly_cloudy',
      shortForecast: 'Partly Sunny',
    });
    expect(weather?.asOf).toBeInstanceOf(Date);
  });

  it('stores the grid but fetches no weather for an org the filter leaves out', async () => {
    registerWeatherOrgFilter(async () => []);
    const location = await create(t.db, org);
    await runWorker(t.db, { handlers: jobHandlers });

    expect((await locationRow(location.id))?.nws_forecast_url).toMatch(
      /^https:\/\/api\.weather\.gov\//,
    );
    expect(await weatherRow(location.id)).toBeNull();
  });
});

describe('locations.refresh_weather', () => {
  it('refreshes weather with the stub provider', async () => {
    const location = await create(t.db, org);
    await refreshWeather(t.db, { provider: stubWeather(), now: FIXED_NOW });
    expect((await getWeather(t.db, [location.id], FIXED_NOW)).get(location.id)).toEqual({
      temperatureF: 54,
      condition: 'partly_cloudy',
      shortForecast: 'Partly Sunny',
      asOf: FIXED_NOW,
    });
  });

  it('hides weather after a failed fetch until one succeeds again', async () => {
    const location = await create(t.db, org);
    await refreshWeather(t.db, { provider: stubWeather(), now: FIXED_NOW });
    await refreshWeather(t.db, { provider: failing, now: FIXED_NOW });

    expect(await weatherRow(location.id)).toMatchObject({ failures: 1, temperature_f: 54 });
    expect((await getWeather(t.db, [location.id], FIXED_NOW)).has(location.id)).toBe(false);

    await refreshWeather(t.db, { provider: stubWeather(), now: FIXED_NOW });
    expect(await weatherRow(location.id)).toMatchObject({ failures: 0, last_error: null });
    expect((await getWeather(t.db, [location.id], FIXED_NOW)).has(location.id)).toBe(true);
  });

  it('hides weather fetched more than 2 hours ago', async () => {
    const stale = await create(t.db, org);
    await refreshWeather(t.db, {
      provider: stubWeather(),
      now: new Date(FIXED_NOW.getTime() - 121 * MINUTE),
    });
    expect((await getWeather(t.db, [stale.id], FIXED_NOW)).has(stale.id)).toBe(false);

    await refreshWeather(t.db, {
      provider: stubWeather(),
      now: new Date(FIXED_NOW.getTime() - 119 * MINUTE),
    });
    expect((await getWeather(t.db, [stale.id], FIXED_NOW)).has(stale.id)).toBe(true);
  });

  it('fetches only the orgs the registered filter keeps, and skips archived locations', async () => {
    const other = await seedHostOrg(t.db, { name: 'Other Outfit' });
    const mine = await create(t.db, org);
    const archived = await create(t.db, org, { ...seward, name: 'Old dock' });
    await archiveLocation(t.db, org.owner.ctx, archived.id);
    const theirs = await create(t.db, other);
    const seen: string[][] = [];
    registerWeatherOrgFilter(async (_db, orgIds) => {
      seen.push(orgIds);
      return orgIds.filter((id) => id === org.orgId);
    });

    await refreshWeather(t.db, { provider: stubWeather(), now: FIXED_NOW });
    expect(seen.flat()).toEqual(expect.arrayContaining([org.orgId, other.orgId]));
    expect((await weatherRow(mine.id))?.temperature_f).toBe(54);
    expect(await weatherRow(archived.id)).toBeNull();
    expect(await weatherRow(theirs.id)).toBeNull();
  });

  it('runs at most 5 provider requests at once', async () => {
    const big = await seedHostOrg(t.db, { name: 'Big Outfit' });
    for (let n = 0; n < 12; n++) await create(t.db, big, { ...seward, name: `Dock ${n}` });
    registerWeatherOrgFilter(async (_db, orgIds) => orgIds.filter((id) => id === big.orgId));

    let inFlight = 0;
    let peak = 0;
    let calls = 0;
    const track = async <T>(value: T): Promise<T> => {
      inFlight += 1;
      calls += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight -= 1;
      return value;
    };
    const slow: WeatherProvider = {
      points: () => track({ forecastHourlyUrl: HOURLY_URL, timeZone: 'America/Anchorage' }),
      firstHourlyPeriod: () =>
        track({ temperatureF: 50, shortForecast: 'Sunny', startTime: FIXED_NOW }),
    };

    await refreshWeather(t.db, { provider: slow, now: FIXED_NOW });
    expect(calls).toBe(24);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });
});
