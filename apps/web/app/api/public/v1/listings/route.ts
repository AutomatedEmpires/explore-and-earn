import {
	searchPublicListings,
	validatePublicListingQuery,
} from "../../../../../services/publicInventory";
import {
	apiError,
	apiOk,
	clientIp,
	PUBLIC_LIST_CACHE,
} from "../../../../../lib/publicApi";
import { checkRateLimit } from "../../../../../lib/rateLimit";

/**
 * GET /api/public/v1/listings — versioned, read-only public inventory search
 * for external agents (RFC 2026-07-14 §1; llms.txt documents this surface).
 *
 * Query params: q, category (farm|maritime|remote|seasonal|mix), housing,
 * meals, visaSupport, minPay (whole dollars), place, startAfter, startBefore
 * (ISO dates), minLat/maxLat/minLng/maxLng (all four or none), limit (1-100),
 * cursor (opaque). Invalid filters → 400 VALIDATION_FAILED with field detail.
 *
 * LIVE listings only; empty inventory returns an empty array (honest, cached
 * briefly). Thin adapter — all logic lives in services/publicInventory.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	const { allowed } = checkRateLimit(`public-api:list:${clientIp(request)}`, 60, 60 * 1000);
	if (!allowed) {
		return apiError({ code: "RATE_LIMITED", message: "Too many requests — retry shortly." });
	}

	const params = new URL(request.url).searchParams;
	const validated = validatePublicListingQuery({
		query: params.get("q"),
		category: params.get("category"),
		housing: params.get("housing"),
		meals: params.get("meals"),
		visaSupport: params.get("visaSupport"),
		minPay: params.get("minPay"),
		place: params.get("place"),
		startAfter: params.get("startAfter"),
		startBefore: params.get("startBefore"),
		minLat: params.get("minLat"),
		maxLat: params.get("maxLat"),
		minLng: params.get("minLng"),
		maxLng: params.get("maxLng"),
		limit: params.get("limit"),
		cursor: params.get("cursor"),
	});
	if (!validated.ok) return apiError(validated.error);

	try {
		const result = await searchPublicListings(validated.value);
		return apiOk(
			{ listings: result.listings },
			{ cacheControl: PUBLIC_LIST_CACHE, nextCursor: result.nextCursor },
		);
	} catch {
		return apiError({ code: "INTERNAL", message: "Search is temporarily unavailable." });
	}
}
