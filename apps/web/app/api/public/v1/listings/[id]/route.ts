import { getPublicListingV1 } from "../../../../../../services/publicInventory";
import {
	apiError,
	apiOk,
	clientIp,
	PUBLIC_DETAIL_CACHE,
} from "../../../../../../lib/publicApi";
import { checkRateLimit } from "../../../../../../lib/rateLimit";

/**
 * GET /api/public/v1/listings/{id} — one LIVE public listing. Unknown,
 * malformed, and non-live ids are indistinguishable (404): closed or draft
 * inventory does not exist on the public agent surface.
 */
export const dynamic = "force-dynamic";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { allowed } = checkRateLimit(`public-api:detail:${clientIp(request)}`, 120, 60 * 1000);
	if (!allowed) {
		return apiError({ code: "RATE_LIMITED", message: "Too many requests — retry shortly." });
	}

	const { id } = await params;
	try {
		const listing = await getPublicListingV1(id);
		if (!listing) {
			return apiError({ code: "NOT_FOUND", message: "No live listing with that id." });
		}
		return apiOk({ listing }, { cacheControl: PUBLIC_DETAIL_CACHE });
	} catch {
		return apiError({ code: "INTERNAL", message: "Listing is temporarily unavailable." });
	}
}
