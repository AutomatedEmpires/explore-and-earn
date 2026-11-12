// An in-memory locations module for B1 tests that mock '@/modules/locations'.
import type { Location, Weather, WeatherOrgFilter } from '@/modules/locations';

const state = {
  locations: new Map<string, Location>(),
  weather: new Map<string, Weather>(),
  destinations: [] as { slug: string; name: string; states: string[] }[],
  weatherOrgFilters: [] as WeatherOrgFilter[],
  calls: [] as { name: string; args: unknown[] }[],
};

const log = (name: string, args: unknown[]) => state.calls.push({ name, args });

const fns = {
  async getLocations(_db: unknown, ids: string[]) {
    log('getLocations', [ids]);
    const out = new Map<string, Location>();
    for (const id of ids) {
      const l = state.locations.get(id);
      if (l) out.set(id, { ...l });
    }
    return out;
  },

  async listOrgLocations(_db: unknown, orgId: string) {
    log('listOrgLocations', [orgId]);
    return [...state.locations.values()].filter((l) => l.orgId === orgId && !l.archived);
  },

  async getWeather(_db: unknown, ids: string[]) {
    log('getWeather', [ids]);
    const out = new Map<string, Weather>();
    for (const id of ids) {
      const w = state.weather.get(id);
      if (w) out.set(id, { ...w });
    }
    return out;
  },

  async listDestinations() {
    log('listDestinations', []);
    return state.destinations.map((d) => ({ ...d }));
  },

  registerWeatherOrgFilter(fn: WeatherOrgFilter) {
    log('registerWeatherOrgFilter', []);
    state.weatherOrgFilters.push(fn);
  },
} satisfies Partial<typeof import('@/modules/locations')>;

let counter = 0;

/** The module's own signatures, so callers type-check exactly as against the real module. */
type Fns = Pick<typeof import('@/modules/locations'), keyof typeof fns>;

export const locationsFake = Object.assign(fns as Fns, {
  calls: state.calls,
  /** The filters registered through registerWeatherOrgFilter. */
  weatherOrgFilters: state.weatherOrgFilters,
  /** Adds or replaces a location; unspecified fields get Seattle-area defaults. */
  setLocation(l: Partial<Location> & { id: string; orgId: string }): Location {
    counter += 1;
    const location: Location = {
      name: `Location ${counter}`,
      kind: 'business_site',
      city: 'Leavenworth',
      state: 'WA',
      publicPoint: { lat: 47.6, lng: -120.66 },
      publicPrecision: 'city',
      publicAddressLine1: null,
      timezone: 'America/Los_Angeles',
      archived: false,
      ...l,
    };
    state.locations.set(location.id, location);
    return location;
  },
  setWeather(locationId: string, w: Weather | null) {
    if (w === null) state.weather.delete(locationId);
    else state.weather.set(locationId, w);
  },
  setDestinations(list: { slug: string; name: string; states: string[] }[]) {
    state.destinations = list.map((d) => ({ ...d }));
  },
  reset() {
    state.locations.clear();
    state.weather.clear();
    state.destinations = [];
    state.calls.length = 0;
  },
});
