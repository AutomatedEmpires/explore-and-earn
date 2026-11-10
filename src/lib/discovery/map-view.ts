// Map bounds on the client (SP3 spec 8.6; plan Task 11A, moved from W7's Task 38 on
// 10 November 2026). Mapbox reports unwrapped longitudes once the map is panned across the
// antimeridian (western Alaska, the Aleutians): −190, or an east edge past 180. The API takes
// longitudes in ±180 and accepts west > east for a box that crosses it (Review Focus 5).

/** The contiguous US. */
export const DEFAULT_BOUNDS = [-125, 24, -66, 50] as const;

const STORAGE_KEY = 'ee_map_bounds';

/** A longitude in [−180, 180). */
const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;
const clampLat = (lat: number) => Math.min(90, Math.max(-90, lat));

/** Mapbox bounds as the API's bbox: longitudes wrapped into ±180 (west may exceed east). */
export function toApiBbox(b: {
  west: number;
  south: number;
  east: number;
  north: number;
}): [number, number, number, number] {
  const south = clampLat(b.south);
  const north = clampLat(b.north);
  if (b.east - b.west >= 360) return [-180, south, 180, north];
  const west = wrap(b.west);
  const east = wrap(b.east);
  // An east edge exactly on the antimeridian is its east side, not −180.
  return [west, south, east === -180 && b.east > b.west ? 180 : east, north];
}

const isBbox = (v: unknown): v is [number, number, number, number] =>
  Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** The bounds kept for this tab, or null (none, unreadable or storage blocked). */
export function readSavedBounds(): [number, number, number, number] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return isBbox(v) ? [v[0], v[1], v[2], v[3]] : null;
  } catch {
    return null;
  }
}

/** Keeps the bounds for this tab; a blocked or full storage is ignored. */
export function saveBounds(b: [number, number, number, number]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // Private mode or storage disabled: the map opens at the default view next time.
  }
}
