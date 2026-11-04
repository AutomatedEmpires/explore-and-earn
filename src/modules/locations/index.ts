// Public API of the locations module: locations, geocoding, weather and destinations (SP2 spec
// sections 3 and 8.5). Imports no SP2 module. Built by W4 (Tasks 20-21).
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

export { listDestinations } from './destinations';

export {
  getWeather,
  getWeatherProvider,
  mapCondition,
  nwsWeather,
  registerWeatherOrgFilter,
  stubWeather,
  type WeatherProvider,
} from './weather';

export { jobHandlers, refreshWeather, resolveNwsGrid, type RefreshResult } from './jobs';
