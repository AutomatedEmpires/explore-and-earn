// Static robots.txt served via a route handler. Replaces the previous
// app/robots.ts metadata route (the two cannot coexist — both resolve to
// /robots.txt).
import { HOST_DASHBOARD_SEGMENTS } from "../../lib/hostRoutes";

export const dynamic = "force-static";

const baseUrl =
	process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

export function GET(): Response {
	const body = [
		"User-agent: *",
		"Allow: /",
		// Auth-gated host dashboard — NOT the public /host/{id} profile, which
		// shares the /host/ prefix and is intentionally indexed (see sitemap.ts
		// and llms.txt). `/host$` anchors to the exact dashboard-home path only.
		"Disallow: /host$",
		...HOST_DASHBOARD_SEGMENTS.map((segment) => `Disallow: /host/${segment}`),
		// Seeker-specific surfaces that require sign-in
		// Note: /seek and /map are public discovery surfaces — intentionally allowed and indexed.
		"Disallow: /accepted",
		"Disallow: /applied",
		"Disallow: /home",
		"Disallow: /invites",
		"Disallow: /journey",
		"Disallow: /messages",
		"Disallow: /notifications",
		"Disallow: /offered",
		"Disallow: /profile",
		"Disallow: /resume",
		"Disallow: /saved",
		"Disallow: /schedule",
		"Disallow: /settings",
		"Disallow: /swipe",
		"Disallow: /travel",
		// API (machine-only endpoints)
		"Disallow: /api/",
		`Sitemap: ${baseUrl}/sitemap.xml`,
		"",
	].join("\n");

	return new Response(body, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
