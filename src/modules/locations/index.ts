// Public API of the locations module: locations, geocoding, weather and destinations (SP2 spec
// sections 3 and 8.5). W0 contract: typed stubs that W4 (Tasks 20-21) replaces. Imports no SP2
// module.
import type { DbOrTx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';

export type WeatherCondition =
  'clear' | 'partly_cloudy' | 'cloudy' | 'rain' | 'snow' | 'storm' | 'fog' | 'wind';

export type Location = {
  id: string;
  orgId: string;
  name: string;
  kind: 'business_site' | 'port' | 'headquarters' | 'area';
  city: string;
  state: string;
  publicPoint: { lat: number; lng: number };
  publicPrecision: 'exact' | 'city';
  /** The street address, set only for `exact` precision. */
  publicAddressLine1: string | null;
  timezone: string;
  archived: boolean;
};

export type Weather = {
  temperatureF: number;
  condition: WeatherCondition;
  shortForecast: string;
  asOf: Date;
};

/** Which of `orgIds` get their weather refreshed (hostpages registers: entitled orgs). */
export type WeatherOrgFilter = (db: DbOrTx, orgIds: string[]) => Promise<string[]>;

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W4)`);
}

export async function getLocations(_db: DbOrTx, _ids: string[]): Promise<Map<string, Location>> {
  return notImplemented('getLocations');
}

export async function listOrgLocations(_db: DbOrTx, _orgId: string): Promise<Location[]> {
  return notImplemented('listOrgLocations');
}

/** Omits locations whose weather is missing, failing or stale. */
export async function getWeather(_db: DbOrTx, _ids: string[]): Promise<Map<string, Weather>> {
  return notImplemented('getWeather');
}

/** SP3 landing pages. */
export async function listDestinations(
  _db: DbOrTx,
): Promise<{ slug: string; name: string; states: string[] }[]> {
  return notImplemented('listDestinations');
}

const weatherOrgFilters: WeatherOrgFilter[] = [];

export function registerWeatherOrgFilter(fn: WeatherOrgFilter): void {
  weatherOrgFilters.push(fn);
}

/** SP8 registers these with its privacy exporter and eraser. */
export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export() {
    return notImplemented('privacyHandlers.export');
  },
  async erase() {
    return notImplemented('privacyHandlers.erase');
  },
};

const noop = async () => {};

/** W4 replaces each no-op (spec section 6). */
export const jobHandlers: HandlerMap = {
  'locations.resolve_nws_grid': noop,
  'locations.refresh_weather': noop,
};
