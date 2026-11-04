// Public types of the locations module (SP2 spec section 3), re-exported by index.ts.
import type { DbOrTx } from '@/lib/db';
import type { LatLng } from './public-point';

export type WeatherCondition =
  'clear' | 'partly_cloudy' | 'cloudy' | 'rain' | 'snow' | 'storm' | 'fog' | 'wind';

export type LocationKind = 'business_site' | 'port' | 'headquarters' | 'area';

/** What any module may show of a location. The private point and street address stay out. */
export type Location = {
  id: string;
  orgId: string;
  name: string;
  kind: LocationKind;
  city: string;
  state: string;
  publicPoint: LatLng;
  publicPrecision: 'exact' | 'city';
  /** The street address, set only for `exact` precision. */
  publicAddressLine1: string | null;
  timezone: string;
  archived: boolean;
};

/**
 * A location as the org's own host APIs return it: with the private point and the full
 * address, so the editor can show them. Never sent anywhere else.
 */
export type HostLocation = Location & {
  address: { line1: string | null; city: string; state: string; postalCode: string | null };
  point: LatLng;
};

export type Weather = {
  temperatureF: number;
  condition: WeatherCondition;
  shortForecast: string;
  asOf: Date;
};

/** Which of `orgIds` get their weather refreshed (hostpages registers: entitled orgs). */
export type WeatherOrgFilter = (db: DbOrTx, orgIds: string[]) => Promise<string[]>;
