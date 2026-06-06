// Static robots.txt served via a route handler. Replaces the previous
// app/robots.ts metadata route (the two cannot coexist — both resolve to
// /robots.txt).
export const dynamic = "force-static";

export function GET(): Response {
	const body = [
		"User-agent: *",
		"Allow: /",
		"Disallow: /host/",
		"Disallow: /api/",
		"Sitemap: https://exploreandearn.com/sitemap.xml",
		"",
	].join("\n");

	return new Response(body, {
		headers: { "Content-Type": "text/plain" },
	});
}
