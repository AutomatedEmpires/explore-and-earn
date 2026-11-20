// Map bounds on the client (SP3 spec 8.6). W0 stub: W7 replaces the bodies (Task 38).

/** The contiguous US. */
export const DEFAULT_BOUNDS = [-125, 24, -66, 50] as const;

/** Mapbox bounds as the API's bbox: longitudes wrapped into ±180 (west may exceed east). */
export function toApiBbox(_b: {
  west: number;
  south: number;
  east: number;
  north: number;
}): [number, number, number, number] {
  throw new Error('not implemented: toApiBbox');
}

export function readSavedBounds(): [number, number, number, number] | null {
  throw new Error('not implemented: readSavedBounds');
}

export function saveBounds(_b: [number, number, number, number]): void {
  throw new Error('not implemented: saveBounds');
}
