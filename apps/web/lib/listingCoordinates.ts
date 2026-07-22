import { isValidGeoPoint, type GeoPoint } from "@explore-and-earn/contracts";

type FormDataReader = Pick<FormData, "get" | "has">;

export type ListingCoordinateSubmission =
  | { readonly ok: true; readonly coordinates: GeoPoint | null | undefined }
  | { readonly ok: false; readonly error: string };

const INVALID_COORDINATES =
  "Choose a location from the search results, or remove its map pin and save the location name only.";

/**
 * Read the coordinate pair with deliberate update semantics:
 * - neither location nor coordinates submitted: preserve the stored point;
 * - a legacy location-name-only submit: clear the stale point;
 * - two blank coordinate fields: explicitly clear the point;
 * - two valid fields: set the point;
 * - every partial/malformed pair: reject before the database boundary.
 */
export function parseListingCoordinateSubmission(
  formData: FormDataReader,
): ListingCoordinateSubmission {
  const hasLatitude = formData.has("latitude");
  const hasLongitude = formData.has("longitude");

  if (!hasLatitude && !hasLongitude) {
    return {
      ok: true,
      coordinates: formData.has("locationName") ? null : undefined,
    };
  }
  if (hasLatitude !== hasLongitude) {
    return { ok: false, error: INVALID_COORDINATES };
  }

  const rawLatitude = formData.get("latitude");
  const rawLongitude = formData.get("longitude");
  if (typeof rawLatitude !== "string" || typeof rawLongitude !== "string") {
    return { ok: false, error: INVALID_COORDINATES };
  }

  const latitude = rawLatitude.trim();
  const longitude = rawLongitude.trim();
  if (latitude.length === 0 && longitude.length === 0) {
    return { ok: true, coordinates: null };
  }
  if (latitude.length === 0 || longitude.length === 0) {
    return { ok: false, error: INVALID_COORDINATES };
  }

  const point = { lat: Number(latitude), lng: Number(longitude) };
  const locationName = formData.get("locationName");
  if (
    !isValidGeoPoint(point) ||
    typeof locationName !== "string" ||
    locationName.trim().length === 0
  ) {
    return { ok: false, error: INVALID_COORDINATES };
  }

  return { ok: true, coordinates: point };
}
