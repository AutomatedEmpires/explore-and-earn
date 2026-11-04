// Public API of the locations module: locations, geocoding, weather and destinations (SP2 spec
// sections 3 and 8.5). Imports no SP2 module. Built by W4 (Tasks 20-21).
import type { DbOrTx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';
import type { Weather, WeatherOrgFilter } from './types';

export type {
  HostLocation,
  Location,
  LocationKind,
  Weather,
  WeatherCondition,
  WeatherOrgFilter,
} from './types';

export {
  censusGeocoder,
  getGeocoder,
  stubGeocoder,
  type GeocodeAddress,
  type GeocodeCandidate,
  type Geocoder,
} from './geocoder';

export { toPublicPoint, type LatLng, type PublicPrecision } from './public-point';

export {
  archiveLocation,
  createLocation,
  geocodeAddress,
  geocodeInputSchema,
  getLocations,
  hostLocationJsonSchema,
  listHostLocations,
  listOrgLocations,
  locationInputSchema,
  locationPatchSchema,
  updateLocation,
  type LocationAddressInput,
  type LocationInput,
  type LocationPatch,
} from './service';

export { privacyHandlers } from './privacy';

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W4)`);
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

const noop = async () => {};

/** Task 21 replaces each no-op (spec section 6). */
export const jobHandlers: HandlerMap = {
  'locations.resolve_nws_grid': noop,
  'locations.refresh_weather': noop,
};
