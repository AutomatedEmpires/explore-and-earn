import { getPublicOrganizationV1 } from "../../../../../../services/publicInventory";
import {
	apiError,
	apiOk,
	clientIp,
	PUBLIC_DETAIL_CACHE,
} from "../../../../../../lib/publicApi";
import { checkRateLimit } from "../../../../../../lib/rateLimit";

/**
 * GET /api/public/v1/organizations/{id} — a host's PUBLIC profile (the same
 * fields the public /host/{id} page renders) plus its live listing count.
 * Never exposes billing, contact, moderation, or internal fields.
 */
export const dynamic = "force-dynamic";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { allowed } = checkRateLimit(`public-api:org:${clientIp(request)}`, 120, 60 * 1000);
	if (!allowed) {
		return apiError({ code: "RATE_LIMITED", message: "Too many requests — retry shortly." });
	}

	const { id } = await params;
	try {
		const organization = await getPublicOrganizationV1(id);
		if (!organization) {
			return apiError({ code: "NOT_FOUND", message: "No organization with that id." });
		}
		return apiOk({ organization }, { cacheControl: PUBLIC_DETAIL_CACHE });
	} catch {
		return apiError({ code: "INTERNAL", message: "Organization is temporarily unavailable." });
	}
}
