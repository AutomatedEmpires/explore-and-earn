// Address geocoding (SP2 spec section 9): the US Census Geocoder (free, no key, results may be
// stored) or a stub. A miss, an HTTP error or a timeout is an empty candidate list, and the
// host drops a pin instead.
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

export type GeocodeAddress = { line1: string; city: string; state: string; postalCode?: string };
export type GeocodeCandidate = { lat: number; lng: number; matched: string };

export interface Geocoder {
  geocode(a: GeocodeAddress): Promise<GeocodeCandidate[]>;
}

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/address';
const TIMEOUT_MS = 5_000;

const censusResponse = z.object({
  result: z.object({
    addressMatches: z.array(
      z.object({
        coordinates: z.object({ x: z.number(), y: z.number() }),
        matchedAddress: z.string(),
      }),
    ),
  }),
});

/** The Census `locations/address` endpoint on the current public address ranges. */
export function censusGeocoder(o: { fetch?: typeof fetch; timeoutMs?: number } = {}): Geocoder {
  const fetchFn = o.fetch ?? fetch;
  const timeoutMs = o.timeoutMs ?? TIMEOUT_MS;
  return {
    async geocode(a) {
      const url = new URL(CENSUS_URL);
      url.searchParams.set('street', a.line1);
      url.searchParams.set('city', a.city);
      url.searchParams.set('state', a.state);
      url.searchParams.set('zip', a.postalCode ?? '');
      url.searchParams.set('benchmark', 'Public_AR_Current');
      url.searchParams.set('format', 'json');
      try {
        const res = await fetchFn(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          logger.warn('census geocoder answered with an error', { status: res.status });
          await res.body?.cancel();
          return [];
        }
        const parsed = censusResponse.safeParse(await res.json());
        if (!parsed.success) {
          logger.warn('census geocoder answered with an unexpected body');
          return [];
        }
        return parsed.data.result.addressMatches.map((m) => ({
          lat: m.coordinates.y,
          lng: m.coordinates.x,
          matched: m.matchedAddress,
        }));
      } catch (err) {
        logger.warn('census geocoder request failed', { error: err });
        return [];
      }
    },
  };
}

/** A fixed point near Seward, Alaska, or no match when `line1` contains `__nomatch__`. */
export function stubGeocoder(): Geocoder {
  return {
    async geocode(a) {
      if (a.line1.includes('__nomatch__')) return [];
      return [{ lat: 60.1042, lng: -149.4422, matched: `${a.line1}, ${a.city}, ${a.state}` }];
    },
  };
}

/** The geocoder `GEOCODER_PROVIDER` selects. */
export function getGeocoder(): Geocoder {
  return getEnv().GEOCODER_PROVIDER === 'census' ? censusGeocoder() : stubGeocoder();
}
