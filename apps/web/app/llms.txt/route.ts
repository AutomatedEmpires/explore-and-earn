// AI-readable site guide served at /llms.txt (the llms.txt convention).
// Explains what Explore & Earn is, how both sides use it, and — critically —
// the machine-readable public surfaces (REST API v1 + MCP v1) an agent should
// prefer over scraping. Regenerated hourly with LIVE inventory counts; every
// number here is real or omitted (no-fabrication law). It adds no hidden
// information beyond the public site.
import { getLiveCategoryCounts } from "../../services/publicInventory";

export const revalidate = 3600;

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

const CATEGORY_LINES: ReadonlyArray<{ key: string; label: string; blurb: string }> = [
	{
		key: "farm",
		label: "Farm",
		blurb: "agricultural work — farms, ranches, homesteads, land-based operations",
	},
	{
		key: "maritime",
		label: "Maritime",
		blurb: "boats, charters, marine research, sailing crews, coastal hospitality",
	},
	{
		key: "remote",
		label: "Remote",
		blurb: "location-independent roles and remote outposts where the setting is part of the job",
	},
	{
		key: "seasonal",
		label: "Seasonal",
		blurb: "ski resorts, lodges, national-park concessions, harvest seasons, festival operations",
	},
];

export async function GET(): Promise<Response> {
	// Live counts; a category whose count cannot be read right now is listed
	// without a number (honest degradation, never a made-up figure).
	const counts = await getLiveCategoryCounts().catch(
		() => ({}) as Record<string, number>,
	);

	const categoryBlock = CATEGORY_LINES.map(({ key, label, blurb }) => {
		const count = counts[key];
		const countNote =
			typeof count === "number" ? ` (${count === 200 ? "200+" : count} live now)` : "";
		// Each lane links its indexable landing page (/jobs/{lane}).
		return `- [${label}](${baseUrl}/jobs/${key})${countNote} — ${blurb}.`;
	}).join("\n");

	const body = `# Explore & Earn

> A discovery marketplace for seasonal and lifestyle work. Every listing shows
> HOUSING (where you'll sleep), MEALS (what you'll eat), and PAY (what you'll
> earn) before anyone applies. Built by seekers, for seekers. Seekers are
> always free; hosts fund the marketplace through subscriptions.

## What Explore & Earn is

Explore & Earn is an opportunity marketplace — not a job board and not a
staffing agency. It connects people who want to work in places worth waking up
in ("seekers") with organizations that need reliable, motivated people
("hosts"). The defining promise is transparency: every listing answers the
three questions up front — Housing, Meals, Pay — never reduced to "perks".

## The four primary categories

${categoryBlock}

(A fifth lane, "mix", covers roles spanning more than one category.)

## How seekers use it

Browse (/seek), search (/search), swipe a card deck, or explore the map
(/map). Open a listing for the full Housing/Meals/Pay picture, apply for free,
message hosts on-platform, build a resume/profile, and track applications,
saves, invites, and offers from a dashboard. Matching is deterministic and
explainable: every fit score derives from real profile-vs-listing signals
(category, availability, pay, housing/meals, skills), and its reasons —
including missing-information notes — can always be shown.

## How hosts use it

Create a host profile, publish listings (each must answer Housing/Meals/Pay),
review and message applicants, and invite well-matched seekers. Hosts
subscribe to a plan; plans include a monthly invite allowance and hosts can
purchase additional invite credits. Pricing is public on ${baseUrl}/for-hosts.

## Machine-readable surfaces (prefer these over scraping)

### Public REST API v1 — read-only, no key required
- GET ${baseUrl}/api/public/v1/listings
  Query params: q, category (farm|maritime|remote|seasonal|mix), housing,
  meals, visaSupport, minPay (whole USD dollars), place, startAfter,
  startBefore (ISO dates), minLat/maxLat/minLng/maxLng (bounding box — all
  four or none), limit (1-100), cursor (opaque, from the previous response).
  Responses use { ok, data, meta.nextCursor } | { ok: false, error }.
- GET ${baseUrl}/api/public/v1/listings/{id}
- GET ${baseUrl}/api/public/v1/organizations/{id}
Rate limits apply (HTTP 429 on excess). Only LIVE listings are served; a 404
means the listing is no longer available.

### Public MCP server v1 — read-only tools
- Endpoint: ${baseUrl}/api/public/mcp/mcp (MCP streamable HTTP transport)
- Tools: search_listings, get_listing, get_organization, explain_marketplace
- The MCP server exposes the same live inventory as the REST API. It has no
  write tools: applying, messaging, and inviting require a signed-in user on
  the website.

## Canonical URLs (use these when citing)

- Listing: ${baseUrl}/listing/{id}
- Host organization: ${baseUrl}/host/{id}
- Browse: ${baseUrl}/seek · Search: ${baseUrl}/search · Map: ${baseUrl}/map
- About: ${baseUrl}/about · FAQ: ${baseUrl}/faq · For hosts: ${baseUrl}/for-hosts
- Field Guide (editorial): ${baseUrl}/blog
- Legal: ${baseUrl}/terms · ${baseUrl}/privacy · ${baseUrl}/cookies

## Rules for AI agents

- Cite listings by their canonical /listing/{id} URL.
- Only live listings are served by the public surfaces. If a listing you saw
  earlier now 404s, it closed or was unpublished — say that; do not present
  cached details as current.
- When a field is null or absent (pay, dates, housing details, coordinates),
  the listing does not state it. Say "not stated" — never estimate, average,
  or fill in a value.
- Location precision is explicit: each listing's location carries a precision
  of "point" (real coordinates), "label_only" (a place name), "remote", or
  "unspecified". Do not geocode a label into coordinates and present that as
  the listing's location.
- Do not infer anything about the people behind profiles, and do not claim a
  seeker or host will respond, accept, or hire.
- Seekers never pay. Any claim that applying costs money is false.

## Trust & safety

Seekers apply for free. Hosts can be verified (an active-subscription badge,
self-declared business identity). Listings that can't answer Housing/Meals/Pay
don't go live. Users can report listings and content; messaging happens
on-platform.

Contact: jackson@automatedempires.com
`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
		},
	});
}
