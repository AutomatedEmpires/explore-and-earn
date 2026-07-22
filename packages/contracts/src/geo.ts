// Geographic query contracts — shared by web discovery, Mapbox surfaces, the
// public API, the MCP server, and future native clients (RFC 2026-07-14 §1).
//
// HONESTY: the location model is one display label plus optional point
// coordinates on the listing (no address/region/country structure exists).
// These contracts expose exactly that precision — a consumer can always tell
// whether it has a real point, a text label, both, or neither. Nothing here
// upgrades text to coordinates or invents precision.

/** What a listing's location data actually provides. */
export const GEO_PRECISION = [
	/** Real point coordinates are present (public by product design). */
	"point",
	/** Only the free-text display label is present. */
	"label_only",
	/** The listing is remote work — place is not where the work happens. */
	"remote",
	/** No location information at all (missing data, stated as such). */
	"unspecified",
] as const
export type GeoPrecision = (typeof GEO_PRECISION)[number]

export interface GeoPoint {
	readonly lat: number
	readonly lng: number
}

/**
 * A rectangular bounding box. Constraints (validated by isValidGeoBounds):
 * -90 ≤ minLat ≤ maxLat ≤ 90, -180 ≤ minLng ≤ maxLng ≤ 180. Boxes crossing
 * the antimeridian are NOT supported in v1 — reject clearly, never guess.
 */
export interface GeoBounds {
	readonly minLat: number
	readonly maxLat: number
	readonly minLng: number
	readonly maxLng: number
}

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value)

/** Validate a concrete point before it crosses a persistence or map boundary. */
export function isValidGeoPoint(value: unknown): value is GeoPoint {
	if (!value || typeof value !== "object") return false
	const point = value as Record<string, unknown>
	return (
		isFiniteNumber(point.lat) &&
		isFiniteNumber(point.lng) &&
		point.lat >= -90 &&
		point.lat <= 90 &&
		point.lng >= -180 &&
		point.lng <= 180
	)
}

export function isValidGeoBounds(value: unknown): value is GeoBounds {
	if (!value || typeof value !== "object") return false
	const b = value as Record<string, unknown>
	if (
		!isFiniteNumber(b.minLat) ||
		!isFiniteNumber(b.maxLat) ||
		!isFiniteNumber(b.minLng) ||
		!isFiniteNumber(b.maxLng)
	) {
		return false
	}
	return (
		b.minLat >= -90 &&
		b.maxLat <= 90 &&
		b.minLat <= b.maxLat &&
		b.minLng >= -180 &&
		b.maxLng <= 180 &&
		b.minLng <= b.maxLng
	)
}

/** Derive the honest precision level from the fields a listing actually has. */
export function geoPrecisionOf(args: {
	readonly isRemoteCategory: boolean
	readonly hasCoordinates: boolean
	readonly hasLabel: boolean
}): GeoPrecision {
	if (args.isRemoteCategory) return "remote"
	if (args.hasCoordinates) return "point"
	if (args.hasLabel) return "label_only"
	return "unspecified"
}
