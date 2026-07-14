import "server-only";

import {
	getPublicHostProfile,
	getPublicListingById,
	getPublicListingsByHost,
	searchListings,
	type ListingRow,
	type SearchFilters,
} from "@explore-and-earn/db";
import {
	MARKETPLACE_CATEGORIES,
	PUBLIC_API_DEFAULT_PAGE_SIZE,
	PUBLIC_API_MAX_PAGE_SIZE,
	decodePublicCursor,
	encodePublicCursor,
	geoPrecisionOf,
	isValidGeoBounds,
	type ApiError,
	type PublicCategoryV1,
	type PublicListingDetailV1,
	type PublicListingQueryV1,
	type PublicListingSummaryV1,
	type PublicOrganizationV1,
} from "@explore-and-earn/contracts";

/**
 * Public inventory service — the ONE application layer behind every public
 * agent surface (REST /api/public/v1/*, the public MCP server, llms.txt live
 * counts). Adapters do transport; THIS module does search, validation, DTO
 * mapping, and privacy (RFC 2026-07-14 §1: one capability, many adapters).
 *
 * PRIVACY: only live listings (searchListings/anon path is live-only by
 * construction; detail reads re-check status here) and public host fields map
 * into DTOs. Nothing seeker- or applicant-shaped ever enters this module.
 *
 * HONESTY: absent facts stay null. Empty results return empty arrays. Invalid
 * filters are rejected with a typed ApiError — never silently coerced.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

/* -------------------------------------------------------------- validation */

export interface RawPublicListingQuery {
	readonly query?: string | null;
	readonly category?: string | null;
	readonly housing?: string | boolean | null;
	readonly meals?: string | boolean | null;
	readonly visaSupport?: string | boolean | null;
	readonly minPay?: string | number | null;
	readonly place?: string | null;
	readonly startAfter?: string | null;
	readonly startBefore?: string | null;
	readonly minLat?: string | number | null;
	readonly maxLat?: string | number | null;
	readonly minLng?: string | number | null;
	readonly maxLng?: string | number | null;
	readonly limit?: string | number | null;
	readonly cursor?: string | null;
}

type Validated<T> = { ok: true; value: T } | { ok: false; error: ApiError };

const invalid = (message: string, fields?: Record<string, string>): Validated<never> => ({
	ok: false,
	error: { code: "VALIDATION_FAILED", message, ...(fields ? { fields } : {}) },
});

function parseBool(value: string | boolean | null | undefined): boolean | undefined | null {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value === "boolean") return value;
	if (value === "true" || value === "1") return true;
	if (value === "false" || value === "0") return false;
	return null; // invalid
}

function parseNumber(value: string | number | null | undefined): number | undefined | null {
	if (value === undefined || value === null || value === "") return undefined;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Validate + normalize a raw public query. Unsupported values are REJECTED
 * with field-level detail (charter §3.1), never guessed at.
 */
export function validatePublicListingQuery(
	raw: RawPublicListingQuery,
): Validated<PublicListingQueryV1 & { offset: number }> {
	const fields: Record<string, string> = {};

	let category: PublicCategoryV1 | undefined;
	if (raw.category != null && raw.category !== "") {
		if ((MARKETPLACE_CATEGORIES as readonly string[]).includes(raw.category)) {
			category = raw.category as PublicCategoryV1;
		} else {
			fields.category = `must be one of: ${MARKETPLACE_CATEGORIES.join(", ")}`;
		}
	}

	const housing = parseBool(raw.housing);
	if (housing === null) fields.housing = "must be true or false";
	const meals = parseBool(raw.meals);
	if (meals === null) fields.meals = "must be true or false";
	const visaSupport = parseBool(raw.visaSupport);
	if (visaSupport === null) fields.visaSupport = "must be true or false";

	const minPay = parseNumber(raw.minPay);
	if (minPay === null || (minPay !== undefined && (minPay < 0 || minPay > 1_000_000))) {
		if (raw.minPay != null && raw.minPay !== "") {
			fields.minPay = "must be a non-negative number of whole dollars";
		}
	}

	for (const [key, value] of [
		["startAfter", raw.startAfter],
		["startBefore", raw.startBefore],
	] as const) {
		if (value != null && value !== "" && !ISO_DATE_RE.test(value)) {
			fields[key] = "must be an ISO date (YYYY-MM-DD)";
		}
	}

	// Geo bounds: all four corners or none.
	const corners = [raw.minLat, raw.maxLat, raw.minLng, raw.maxLng];
	const providedCorners = corners.filter((c) => c != null && c !== "").length;
	let bounds: PublicListingQueryV1["bounds"];
	if (providedCorners > 0) {
		if (providedCorners < 4) {
			fields.bounds = "provide all of minLat, maxLat, minLng, maxLng — or none";
		} else {
			const candidate = {
				minLat: parseNumber(raw.minLat),
				maxLat: parseNumber(raw.maxLat),
				minLng: parseNumber(raw.minLng),
				maxLng: parseNumber(raw.maxLng),
			};
			if (isValidGeoBounds(candidate)) {
				bounds = candidate;
			} else {
				fields.bounds =
					"invalid bounding box: require -90≤minLat≤maxLat≤90 and -180≤minLng≤maxLng≤180 (boxes crossing the antimeridian are not supported)";
			}
		}
	}

	let limit = PUBLIC_API_DEFAULT_PAGE_SIZE;
	const parsedLimit = parseNumber(raw.limit);
	if (parsedLimit === null) {
		fields.limit = "must be a number";
	} else if (parsedLimit !== undefined) {
		if (parsedLimit < 1 || parsedLimit > PUBLIC_API_MAX_PAGE_SIZE) {
			fields.limit = `must be between 1 and ${PUBLIC_API_MAX_PAGE_SIZE}`;
		} else {
			limit = Math.floor(parsedLimit);
		}
	}

	const offset = decodePublicCursor(raw.cursor ?? undefined);
	if (offset === null) fields.cursor = "invalid cursor";

	if (Object.keys(fields).length > 0) {
		return invalid("One or more filters are invalid.", fields);
	}

	return {
		ok: true,
		value: {
			query: raw.query?.trim() || undefined,
			category,
			housing: housing || undefined,
			meals: meals || undefined,
			visaSupport: visaSupport || undefined,
			minPay: minPay ?? undefined,
			place: raw.place?.trim() || undefined,
			startAfter: raw.startAfter?.trim() || undefined,
			startBefore: raw.startBefore?.trim() || undefined,
			bounds,
			limit,
			cursor: raw.cursor ?? undefined,
			offset: offset ?? 0,
		},
	};
}

/* ----------------------------------------------------------------- mapping */

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPublicId(value: string): boolean {
	return UUID_RE.test(value);
}

function locationOf(args: {
	category: string;
	label: string | null;
	lat: number | null;
	lng: number | null;
}): PublicListingSummaryV1["location"] {
	const hasCoordinates = args.lat != null && args.lng != null;
	return {
		precision: geoPrecisionOf({
			isRemoteCategory: args.category === "remote",
			hasCoordinates,
			hasLabel: Boolean(args.label?.trim()),
		}),
		label: args.label?.trim() || null,
		point: hasCoordinates ? { lat: args.lat as number, lng: args.lng as number } : null,
	};
}

function rowToSummaryV1(row: ListingRow): PublicListingSummaryV1 {
	return {
		id: row.id,
		url: `${BASE_URL}/listing/${row.id}`,
		title: row.title,
		category: row.category,
		location: locationOf({
			category: row.category,
			label: row.location_display,
			lat: row.latitude,
			lng: row.longitude,
		}),
		benefits: {
			housing: {
				included: row.housing_included === true,
				details: row.housing_description?.trim() || null,
			},
			meals: {
				included: row.meals_included === true,
				details: row.meals_description?.trim() || null,
			},
			pay: {
				minCents: row.compensation_min_cents,
				maxCents: row.compensation_max_cents,
				unit: row.compensation_unit,
				currency: row.compensation_currency,
				summary: row.compensation_summary?.trim() || null,
			},
		},
		beginsAt: row.begins_at,
		endsAt: row.ends_at,
		publishedAt: row.published_at,
		coverPhotoUrl: row.cover_photo_url,
		organizationId: row.host_profile_id,
		organizationName: row.host_profiles?.company_name ?? null,
		visaSupport: row.visa_support === true,
	};
}

function rowToDetailV1(row: ListingRow): PublicListingDetailV1 {
	return {
		...rowToSummaryV1(row),
		description: row.description?.trim() || null,
		galleryPhotoUrls: Array.isArray(row.gallery_photo_urls)
			? row.gallery_photo_urls
			: [],
	};
}

/* ----------------------------------------------------------------- queries */

export interface PublicListingSearchResult {
	readonly listings: readonly PublicListingSummaryV1[];
	readonly nextCursor: string | null;
}

/** Search live public inventory with a VALIDATED query. */
export async function searchPublicListings(
	query: PublicListingQueryV1 & { offset: number },
): Promise<PublicListingSearchResult> {
	const limit = query.limit ?? PUBLIC_API_DEFAULT_PAGE_SIZE;
	const filters: SearchFilters = {
		query: query.query,
		categories: query.category ? [query.category] : undefined,
		hasHousing: query.housing,
		hasMeals: query.meals,
		visaSupport: query.visaSupport,
		payMin: query.minPay,
		location: query.place,
		startDateAfter: query.startAfter,
		startDateBefore: query.startBefore,
		bounds: query.bounds,
		limit: limit + 1, // one extra row = "has next page"
		offset: query.offset,
	};

	const rows = await searchListings(filters);
	const hasNext = rows.length > limit;
	const page = hasNext ? rows.slice(0, limit) : rows;

	return {
		listings: page.map(rowToSummaryV1),
		nextCursor: hasNext ? encodePublicCursor(query.offset + limit) : null,
	};
}

/** One LIVE public listing; null for unknown, non-live, or malformed ids. */
export async function getPublicListingV1(
	listingId: string,
): Promise<PublicListingDetailV1 | null> {
	if (!isPublicId(listingId)) return null;
	// getPublicListingById is live-only by construction — closed/draft/paused
	// inventory structurally does not exist on the public agent surface.
	const row = await getPublicListingById(listingId);
	if (!row) return null;
	return rowToDetailV1(row);
}

/** One public organization + live listing count; null when unknown. */
export async function getPublicOrganizationV1(
	organizationId: string,
): Promise<PublicOrganizationV1 | null> {
	if (!isPublicId(organizationId)) return null;
	const [profile, listings] = await Promise.all([
		getPublicHostProfile(organizationId),
		getPublicListingsByHost(organizationId).catch(() => []),
	]);
	if (!profile) return null;
	return {
		id: profile.id,
		url: `${BASE_URL}/host/${profile.id}`,
		name: profile.companyName,
		tagline: profile.tagline,
		about: profile.about,
		primaryLocationName: profile.primaryLocationName,
		photoUrl: profile.photoUrl,
		websiteUrl: profile.websiteUrl,
		categories: profile.categoryScopes.filter((c): c is PublicCategoryV1 =>
			(MARKETPLACE_CATEGORIES as readonly string[]).includes(c),
		),
		verified: profile.verified,
		memberSince: profile.createdAt,
		liveListingCount: listings.length,
	};
}

/** Live listing counts per category — llms.txt's honest inventory signal. */
export async function getLiveCategoryCounts(): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	// One bounded query per category keeps this simple and cache-friendly
	// (llms.txt revalidates hourly; this is not a hot path).
	await Promise.all(
		MARKETPLACE_CATEGORIES.map(async (category) => {
			try {
				const rows = await searchListings({ categories: [category], limit: 200 });
				counts[category] = rows.length;
			} catch {
				// Honest degradation: absent count, not zero — llms.txt omits it.
			}
		}),
	);
	return counts;
}
