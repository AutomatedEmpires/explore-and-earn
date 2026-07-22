import { isValidGeoPoint, type GeoPoint } from "@explore-and-earn/contracts";

const MAPBOX_FORWARD_GEOCODING_URL =
  "https://api.mapbox.com/search/geocode/v6/forward";
const MAX_LOCATION_LENGTH = 200;
const MAX_QUERY_WORDS = 20;
const ALLOWED_FEATURE_TYPES = new Set([
  "place",
  "locality",
  "district",
  "region",
  "country",
]);

export interface ListingLocationSuggestion {
  readonly id: string;
  readonly label: string;
  readonly point: GeoPoint;
}

export class MapboxGeocodingError extends Error {
  readonly code: "invalid_query" | "missing_token" | "unavailable";

  constructor(
    code: MapboxGeocodingError["code"],
    message: string,
  ) {
    super(message);
    this.name = "MapboxGeocodingError";
    this.code = code;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 && normalized.length <= MAX_LOCATION_LENGTH
    ? normalized
    : null;
}

/**
 * Mapbox v6 rejects semicolons and accepts at most 20 words. The listing model
 * caps the persisted display label at 200 characters, so the search input uses
 * the same boundary instead of accepting a value that cannot be saved.
 */
export function normalizeMapboxQuery(raw: string): string {
  const query = raw.trim().replace(/\s+/g, " ");
  const wordCount = query.length === 0 ? 0 : query.split(" ").length;
  if (
    query.length === 0 ||
    query.length > MAX_LOCATION_LENGTH ||
    wordCount > MAX_QUERY_WORDS ||
    query.includes(";")
  ) {
    throw new MapboxGeocodingError(
      "invalid_query",
      "Enter a town, city, or region using 20 words or fewer.",
    );
  }
  return query;
}

export function buildMapboxGeocodingUrl(query: string, token: string): URL {
  const normalizedQuery = normalizeMapboxQuery(query);
  const normalizedToken = token.trim();
  if (normalizedToken.length === 0) {
    throw new MapboxGeocodingError(
      "missing_token",
      "Location search is temporarily unavailable.",
    );
  }

  const url = new URL(MAPBOX_FORWARD_GEOCODING_URL);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("access_token", normalizedToken);
  // Coordinates are persisted on the listing, so temporary geocoding results
  // are not legally or operationally sufficient here.
  url.searchParams.set("permanent", "true");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("limit", "5");
  // Hosts select a recognizable area, not a private street address or POI.
  url.searchParams.set("types", "place,locality,district,region,country");
  return url;
}

function suggestionLabel(properties: Record<string, unknown>): string | null {
  const fullAddress = cleanText(properties.full_address);
  if (fullAddress) return fullAddress;

  const name = cleanText(properties.name_preferred) ?? cleanText(properties.name);
  const placeFormatted = cleanText(properties.place_formatted);
  if (name && placeFormatted) {
    const combined = `${name}, ${placeFormatted}`;
    if (combined.length <= MAX_LOCATION_LENGTH) return combined;
  }
  return name ?? placeFormatted;
}

/** Parse untrusted provider JSON and retain only complete, bounded point rows. */
export function parseMapboxGeocodingResponse(
  payload: unknown,
): ListingLocationSuggestion[] {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.features)) {
    throw new MapboxGeocodingError(
      "unavailable",
      "Location search returned an unreadable response. Try again.",
    );
  }

  const seen = new Set<string>();
  const suggestions: ListingLocationSuggestion[] = [];
  for (const rawFeature of root.features) {
    const feature = asRecord(rawFeature);
    const properties = asRecord(feature?.properties);
    const geometry = asRecord(feature?.geometry);
    const featureType = properties?.feature_type;
    const coordinates = geometry?.coordinates;

    if (
      !feature ||
      !properties ||
      !geometry ||
      geometry.type !== "Point" ||
      typeof featureType !== "string" ||
      !ALLOWED_FEATURE_TYPES.has(featureType) ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      continue;
    }

    const point = { lng: coordinates[0], lat: coordinates[1] };
    const label = suggestionLabel(properties);
    if (!label || !isValidGeoPoint(point)) continue;

    const providerId = cleanText(properties.mapbox_id) ?? cleanText(feature.id);
    const id = providerId ?? `${point.lat}:${point.lng}:${label}`;
    const identity = `${point.lat}:${point.lng}:${label}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    suggestions.push({ id, label, point });
  }
  return suggestions;
}

export async function searchMapboxLocations(
  query: string,
  token: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ListingLocationSuggestion[]> {
  const url = buildMapboxGeocodingUrl(query, token);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { Accept: "application/geo+json" },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new MapboxGeocodingError(
      "unavailable",
      "Location search could not connect. Try again.",
    );
  }

  if (!response.ok) {
    throw new MapboxGeocodingError(
      "unavailable",
      "Location search is temporarily unavailable. Try again.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MapboxGeocodingError(
      "unavailable",
      "Location search returned an unreadable response. Try again.",
    );
  }
  return parseMapboxGeocodingResponse(payload);
}
