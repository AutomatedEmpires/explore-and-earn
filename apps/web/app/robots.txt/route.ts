// Static robots.txt served via a route handler. Replaces the previous
// app/robots.ts metadata route (the two cannot coexist — both resolve to
// /robots.txt).
export const dynamic = "force-static";

const baseUrl =
	process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

export function GET(): Response {
	const body = [
		"User-agent: *",
		"Allow: /",
		// Auth-gated host dashboard
		"Disallow: /host/",
		// All seeker-specific surfaces (require sign-in)
		"Disallow: /accepted",
		"Disallow: /applied",
		"Disallow: /home",
		"Disallow: /invites",
		"Disallow: /journey",
		"Disallow: /map",
		"Disallow: /messages",
		"Disallow: /notifications",
		"Disallow: /offered",
		"Disallow: /profile",
		"Disallow: /resume",
		"Disallow: /saved",
		"Disallow: /schedule",
		"Disallow: /seek",
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
