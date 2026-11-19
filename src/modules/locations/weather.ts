// National Weather Service weather (SP2 spec sections 8.5 and 9): the provider, the condition
// mapping, the cached reads with their staleness rules, and the org filter hostpages registers
// so only entitled orgs are fetched.
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { locationWeather } from './schema';
import type { Weather, WeatherCondition, WeatherOrgFilter } from './types';

export interface WeatherProvider {
  /** The grid's hourly forecast URL and time zone; null when NWS has no grid for the point. */
  points(lat: number, lng: number): Promise<{ forecastHourlyUrl: string; timeZone: string } | null>;
  firstHourlyPeriod(
    url: string,
  ): Promise<{ temperatureF: number; shortForecast: string; startTime: Date }>;
}

const NWS_ORIGIN = 'https://api.weather.gov';
const TIMEOUT_MS = 5_000;
/** Reads hide weather fetched longer ago than this. */
export const WEATHER_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const isNwsUrl = (url: string) => url.startsWith(`${NWS_ORIGIN}/`);

/** A coordinate with at most 4 decimals and no trailing zeros, as NWS expects. */
const coord = (n: number) => String(Number(n.toFixed(4)) || 0);

const pointsResponse = z.object({
  properties: z.object({
    forecastHourly: z.string().nullish(),
    timeZone: z.string().nullish(),
  }),
});

const temperature = z.union([
  z.number(),
  z.object({ unitCode: z.string(), value: z.number().nullable() }),
]);

const hourlyResponse = z.object({
  properties: z.object({
    periods: z
      .array(
        z.object({
          startTime: z.string(),
          temperature,
          temperatureUnit: z.string().nullish(),
          shortForecast: z.string(),
        }),
      )
      .min(1),
  }),
});

function toFahrenheit(t: z.infer<typeof temperature>, unit: string | null | undefined): number {
  const celsius = (c: number) => Math.round((c * 9) / 5 + 32);
  if (typeof t === 'number') return unit === 'C' ? celsius(t) : Math.round(t);
  if (t.value === null) throw new Error('NWS period has no temperature');
  return /degC$/.test(t.unitCode) ? celsius(t.value) : Math.round(t.value);
}

/**
 * The NWS API: `/points/{lat},{lng}` for the grid, then its `forecastHourly` URL. Every request
 * carries the contact User-Agent NWS requires and times out after 5 s.
 */
export function nwsWeather(
  userAgent: string,
  o: { fetch?: typeof fetch; timeoutMs?: number } = {},
): WeatherProvider {
  const fetchFn = o.fetch ?? fetch;
  const timeoutMs = o.timeoutMs ?? TIMEOUT_MS;
  const get = (url: string) =>
    fetchFn(url, {
      headers: { 'user-agent': userAgent, accept: 'application/geo+json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

  return {
    async points(lat, lng) {
      const res = await get(`${NWS_ORIGIN}/points/${coord(lat)},${coord(lng)}`);
      if (res.status === 404) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`NWS points answered ${res.status}`);
      }
      const body = pointsResponse.parse(await res.json());
      const url = body.properties.forecastHourly;
      if (!url || !isNwsUrl(url)) return null;
      return { forecastHourlyUrl: url, timeZone: body.properties.timeZone ?? '' };
    },

    async firstHourlyPeriod(url) {
      if (!isNwsUrl(url)) throw new Error('Refusing a forecast URL outside api.weather.gov');
      const res = await get(url);
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`NWS forecast answered ${res.status}`);
      }
      const [first] = hourlyResponse.parse(await res.json()).properties.periods;
      if (!first) throw new Error('NWS forecast has no periods');
      const startTime = new Date(first.startTime);
      if (Number.isNaN(startTime.getTime())) throw new Error('NWS period has a bad startTime');
      return {
        temperatureF: toFahrenheit(first.temperature, first.temperatureUnit),
        shortForecast: first.shortForecast.trim(),
        startTime,
      };
    },
  };
}

/** 54°F and "Partly Sunny" everywhere, on a grid in Alaska (where the stub geocoder points). */
export function stubWeather(): WeatherProvider {
  return {
    async points() {
      return {
        forecastHourlyUrl: `${NWS_ORIGIN}/gridpoints/STUB/1,1/forecast/hourly`,
        timeZone: 'America/Anchorage',
      };
    },
    async firstHourlyPeriod() {
      const hour = new Date();
      hour.setUTCMinutes(0, 0, 0);
      return { temperatureF: 54, shortForecast: 'Partly Sunny', startTime: hour };
    },
  };
}

/** The provider `WEATHER_PROVIDER` selects. */
export function getWeatherProvider(): WeatherProvider {
  const env = getEnv();
  if (env.WEATHER_PROVIDER === 'nws') {
    if (!env.NWS_USER_AGENT)
      throw new Error('NWS_USER_AGENT is required when WEATHER_PROVIDER=nws');
    return nwsWeather(env.NWS_USER_AGENT);
  }
  return stubWeather();
}

/** NWS short forecast text to a condition, checked in this order. */
export function mapCondition(shortForecast: string): WeatherCondition {
  const s = shortForecast.toLowerCase();
  if (/thunder/.test(s)) return 'storm';
  if (/snow|sleet|flurr|\bice\b/.test(s)) return 'snow';
  if (/rain|shower|drizzle/.test(s)) return 'rain';
  if (/fog|haze|smoke/.test(s)) return 'fog';
  if (/breezy|windy|blustery/.test(s)) return 'wind';
  if (/partly|mostly sunny/.test(s)) return 'partly_cloudy';
  if (/cloudy|overcast/.test(s)) return 'cloudy';
  if (/sunny|clear/.test(s)) return 'clear';
  return 'cloudy';
}

// The org filter -----------------------------------------------------------------------------

const weatherOrgFilters: WeatherOrgFilter[] = [];

/** Limits which orgs get weather fetched; hostpages registers "entitled orgs". */
export function registerWeatherOrgFilter(fn: WeatherOrgFilter): void {
  weatherOrgFilters.push(fn);
}

/** Tests only. */
export function clearWeatherOrgFilters(): void {
  weatherOrgFilters.length = 0;
}

/** The orgs among `orgIds` that every registered filter keeps (all of them with none). */
export async function filterWeatherOrgs(db: DbOrTx, orgIds: string[]): Promise<Set<string>> {
  let kept = [...new Set(orgIds)];
  for (const filter of weatherOrgFilters) {
    if (kept.length === 0) break;
    const allowed = new Set(await filter(db, kept));
    kept = kept.filter((id) => allowed.has(id));
  }
  return new Set(kept);
}

// The cache ----------------------------------------------------------------------------------

const MAX_ERROR_LENGTH = 500;

/** Stores a successful fetch and clears the failure count. */
export async function saveWeather(
  db: DbOrTx,
  locationId: string,
  period: { temperatureF: number; shortForecast: string; startTime: Date },
  now: Date,
): Promise<void> {
  const values = {
    temperatureF: period.temperatureF,
    condition: mapCondition(period.shortForecast),
    shortForecast: period.shortForecast,
    periodStart: period.startTime,
    fetchedAt: now,
    failures: 0,
    lastError: null,
  };
  await db
    .insert(locationWeather)
    .values({ locationId, ...values })
    .onConflictDoUpdate({ target: locationWeather.locationId, set: values });
}

/** Counts a failed lookup or fetch. The last good data stays but reads hide it. */
export async function recordWeatherFailure(
  db: DbOrTx,
  locationId: string,
  error: unknown,
): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(
    0,
    MAX_ERROR_LENGTH,
  );
  await db
    .insert(locationWeather)
    .values({ locationId, failures: 1, lastError: message })
    .onConflictDoUpdate({
      target: locationWeather.locationId,
      set: { failures: sql`${locationWeather.failures} + 1`, lastError: message },
    });
}

/** Current weather by location, leaving out missing, failing and stale (over 2 h) entries. */
export async function getWeather(
  db: DbOrTx,
  ids: string[],
  now: Date = new Date(),
): Promise<Map<string, Weather>> {
  const out = new Map<string, Weather>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const rows = await db
    .select()
    .from(locationWeather)
    .where(
      and(
        inArray(locationWeather.locationId, unique),
        eq(locationWeather.failures, 0),
        isNotNull(locationWeather.temperatureF),
        gte(locationWeather.fetchedAt, new Date(now.getTime() - WEATHER_MAX_AGE_MS)),
      ),
    );
  for (const r of rows) {
    if (
      r.temperatureF === null ||
      r.condition === null ||
      r.shortForecast === null ||
      r.fetchedAt === null
    ) {
      continue;
    }
    out.set(r.locationId, {
      temperatureF: r.temperatureF,
      condition: r.condition,
      shortForecast: r.shortForecast,
      asOf: r.fetchedAt,
    });
  }
  return out;
}
