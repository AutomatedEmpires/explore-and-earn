import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import {
	getPublicListingV1,
	getPublicOrganizationV1,
	searchPublicListings,
	validatePublicListingQuery,
} from "../../../../../services/publicInventory";
import { checkRateLimit } from "../../../../../lib/rateLimit";

/**
 * Public MCP server v1 — /api/public/mcp/mcp (streamable HTTP).
 *
 * READ-ONLY BY CONSTRUCTION: every tool is a thin adapter over the same
 * services/publicInventory layer the REST API uses (RFC 2026-07-14 §1 — no
 * separate business logic for MCP). No tool mutates anything; there is no
 * authenticated context, no session, and no write path to reach. Output is
 * structured JSON of live public inventory only — the DTOs are the privacy
 * boundary, identical to /api/public/v1/*.
 *
 * HONESTY: empty results return empty arrays with an explicit note; invalid
 * filters return the validation error verbatim; nothing is fabricated.
 */

const CATEGORY = z.enum(["farm", "maritime", "remote", "seasonal", "mix"]);

/** MCP tool result envelope: structured JSON as text content. */
function jsonResult(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
	};
}

const MARKETPLACE_EXPLAINER = {
	name: "Explore & Earn",
	whatItIs:
		"A discovery marketplace for seasonal and lifestyle work. Every listing states HOUSING (where you'll sleep), MEALS (what you'll eat), and PAY (what you'll earn) up front.",
	categories: {
		farm: "Agricultural work — farms, ranches, homesteads, land-based operations.",
		maritime: "Boats, charters, marine research, sailing crews, coastal work.",
		remote: "Location-independent roles and remote outposts.",
		seasonal: "Ski resorts, lodges, park concessions, harvests, festivals.",
		mix: "Roles spanning more than one of the four primary categories.",
	},
	forSeekers:
		"Seekers browse, save, apply, and message hosts for free — seekers never pay. Applying requires an account at https://exploreandearn.com.",
	forHosts:
		"Hosts publish listings, review applicants, and invite matched seekers under a paid subscription.",
	agentGuidance: {
		citation:
			"Cite listings by their canonical url field (https://exploreandearn.com/listing/{id}). Only live listings are served; a 404/absent listing means it is no longer available — say so rather than guessing.",
		doNotInfer:
			"Do not infer pay, housing, or meals when a field is null — the listing does not state it. Do not present match guesses as the marketplace's own scoring.",
	},
	api: "https://exploreandearn.com/api/public/v1 (see /llms.txt)",
} as const;

const handler = createMcpHandler(
	(server) => {
		server.registerTool(
			"search_listings",
			{
				title: "Search live listings",
				description:
					"Search Explore & Earn's LIVE public listings. Filter by free-text query, one of the five categories, housing/meals included, visa support, minimum pay (whole USD dollars), place substring, ISO start-date window, and/or a geographic bounding box (all four corners required). Returns structured listings with canonical URLs plus a nextCursor for pagination. Empty results mean no live inventory matches — report that honestly.",
				inputSchema: {
					query: z.string().max(200).optional(),
					category: CATEGORY.optional(),
					housing: z.boolean().optional().describe("only listings with housing included"),
					meals: z.boolean().optional().describe("only listings with meals included"),
					visaSupport: z.boolean().optional(),
					minPay: z.number().min(0).max(1_000_000).optional(),
					place: z.string().max(120).optional(),
					startAfter: z.string().max(30).optional().describe("ISO date"),
					startBefore: z.string().max(30).optional().describe("ISO date"),
					minLat: z.number().optional(),
					maxLat: z.number().optional(),
					minLng: z.number().optional(),
					maxLng: z.number().optional(),
					limit: z.number().int().min(1).max(20).optional(),
					cursor: z.string().max(64).optional(),
				},
			},
			async (args, extra) => {
				const ip = ipFromExtra(extra);
				if (!checkRateLimit(`public-mcp:${ip}`, 30, 60 * 1000).allowed) {
					return jsonResult({ error: "rate_limited", retryInSeconds: 60 });
				}
				const validated = validatePublicListingQuery({
					query: args.query ?? null,
					category: args.category ?? null,
					housing: args.housing ?? null,
					meals: args.meals ?? null,
					visaSupport: args.visaSupport ?? null,
					minPay: args.minPay ?? null,
					place: args.place ?? null,
					startAfter: args.startAfter ?? null,
					startBefore: args.startBefore ?? null,
					minLat: args.minLat ?? null,
					maxLat: args.maxLat ?? null,
					minLng: args.minLng ?? null,
					maxLng: args.maxLng ?? null,
					// MCP responses ride inside a model context — cap tighter than REST.
					limit: Math.min(args.limit ?? 10, 20),
					cursor: args.cursor ?? null,
				});
				if (!validated.ok) return jsonResult({ error: validated.error });
				const result = await searchPublicListings(validated.value);
				return jsonResult({
					listings: result.listings,
					nextCursor: result.nextCursor,
					...(result.listings.length === 0
						? { note: "No live listings match these filters." }
						: {}),
				});
			},
		);

		server.registerTool(
			"get_listing",
			{
				title: "Get one live listing",
				description:
					"Fetch ONE live public listing by its id (the id from search_listings or a https://exploreandearn.com/listing/{id} URL). Returns full detail including description and the HOUSING/MEALS/PAY triad. Absent means the listing is not live anymore — do not substitute stale data.",
				inputSchema: {
					listingId: z.string().max(64).describe("listing id or /listing/{id} URL"),
				},
			},
			async ({ listingId }, extra) => {
				const ip = ipFromExtra(extra);
				if (!checkRateLimit(`public-mcp:${ip}`, 30, 60 * 1000).allowed) {
					return jsonResult({ error: "rate_limited", retryInSeconds: 60 });
				}
				const id = resolveListingId(listingId);
				const listing = id ? await getPublicListingV1(id) : null;
				return jsonResult(
					listing ? { listing } : { error: "not_found", note: "No live listing with that id." },
				);
			},
		);

		server.registerTool(
			"get_organization",
			{
				title: "Get a host organization",
				description:
					"Fetch a host organization's PUBLIC profile by id (from a listing's organizationId or a https://exploreandearn.com/host/{id} URL): name, about, categories, verified badge, live listing count. Public fields only.",
				inputSchema: {
					organizationId: z.string().max(64).describe("organization id or /host/{id} URL"),
				},
			},
			async ({ organizationId }, extra) => {
				const ip = ipFromExtra(extra);
				if (!checkRateLimit(`public-mcp:${ip}`, 30, 60 * 1000).allowed) {
					return jsonResult({ error: "rate_limited", retryInSeconds: 60 });
				}
				const id = resolveOrgId(organizationId);
				const organization = id ? await getPublicOrganizationV1(id) : null;
				return jsonResult(
					organization
						? { organization }
						: { error: "not_found", note: "No organization with that id." },
				);
			},
		);

		server.registerTool(
			"explain_marketplace",
			{
				title: "How Explore & Earn works",
				description:
					"Explains what Explore & Earn is, the four primary categories, how seekers and hosts use it, and how agents should cite listings and treat missing fields.",
				inputSchema: {},
			},
			async () => jsonResult(MARKETPLACE_EXPLAINER),
		);
	},
	{
		serverInfo: { name: "explore-and-earn-public", version: "1.0.0" },
	},
	{
		basePath: "/api/public/mcp",
		maxDuration: 60,
		disableSse: true,
	},
);

/* --------------------------------------------------------------- utilities */

const UUID_RE =
	/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Accept a bare uuid or a canonical /listing/{id} URL. */
function resolveListingId(value: string): string | null {
	const match = UUID_RE.exec(value);
	return match ? match[0] : null;
}

function resolveOrgId(value: string): string | null {
	const match = UUID_RE.exec(value);
	return match ? match[0] : null;
}

/** Client ip from the MCP request context (falls back to a shared bucket). */
function ipFromExtra(extra: unknown): string {
	const maybe = extra as { requestInfo?: { headers?: Record<string, unknown> } } | undefined;
	const headers = maybe?.requestInfo?.headers;
	if (headers) {
		const forwarded = headers["x-forwarded-for"];
		if (typeof forwarded === "string" && forwarded.length > 0) {
			return forwarded.split(",")[0]!.trim();
		}
	}
	return "unknown";
}

// Keep the exported surface read-only: GET (SSE disabled → 405), POST (tools),
// DELETE (session teardown handled by the adapter).
export { handler as GET, handler as POST, handler as DELETE };
