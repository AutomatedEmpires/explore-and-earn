// Location privacy (SP2 spec section 8.5): what the public sees of a location's point.

export type LatLng = { lat: number; lng: number };
export type PublicPrecision = 'exact' | 'city';

const round2 = (n: number) => Math.round(n * 100) / 100 || 0;

/** `city` rounds both coordinates to 0.01 degrees (about 1 km); `exact` keeps them. */
export function toPublicPoint(p: LatLng, precision: PublicPrecision): LatLng {
  if (precision === 'exact') return { lat: p.lat, lng: p.lng };
  return { lat: round2(p.lat), lng: round2(p.lng) };
}
