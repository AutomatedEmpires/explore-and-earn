import { expect, test, type Page } from "playwright/test";

/**
 * Public SEO / LLM-readability surface tests. These run against `next dev`
 * WITHOUT injected secrets, so they only assert on public, fixture-backed
 * routes — no auth, no Stripe, no live DB required. They regression-guard the
 * structured-data + discoverability work (Organization/WebSite/FAQPage/
 * BreadcrumbList/JobPosting JSON-LD, llms.txt, the FAQ page, sitemap, robots).
 *
 * NOTE: a true auth-gate E2E (protected route -> /sign-in redirect) is NOT
 * included: the Playwright webServer launches `next dev` with no Clerk keys, so
 * the middleware does not enforce auth in this harness (the existing smoke spec
 * relies on /host and /swipe rendering). Auth-gate coverage needs a secret-
 * injected environment (doppler run -- playwright test) and is tracked as a gap.
 */

function ldJsonText(page: Page) {
	return page.locator('script[type="application/ld+json"]').allTextContents();
}

test.describe("public SEO + LLM surfaces", () => {
	test("/llms.txt serves a plain-text AI site guide", async ({ page }) => {
		const res = await page.request.get("/llms.txt");
		expect(res.ok()).toBeTruthy();
		expect(res.headers()["content-type"]).toContain("text/plain");
		const body = await res.text();
		expect(body).toContain("Explore & Earn");
		expect(body).toContain("Housing");
		expect(body).toContain("Meals");
		expect(body).toContain("Pay");
	});

	test("/robots.txt references the sitemap", async ({ page }) => {
		const res = await page.request.get("/robots.txt");
		expect(res.ok()).toBeTruthy();
		const body = await res.text();
		expect(body).toContain("Sitemap:");
	});

	test("/sitemap.xml includes core public pages incl. /faq", async ({ page }) => {
		const res = await page.request.get("/sitemap.xml");
		expect(res.ok()).toBeTruthy();
		const body = await res.text();
		expect(body).toContain("/faq");
		expect(body).toContain("/about");
	});

	test("homepage emits Organization + WebSite JSON-LD", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.ok()).toBeTruthy();
		const blocks = (await ldJsonText(page)).join("\n");
		expect(blocks).toContain("Organization");
		expect(blocks).toContain("WebSite");
	});

	test("/faq renders questions and FAQPage JSON-LD", async ({ page }) => {
		const response = await page.goto("/faq");
		expect(response?.ok()).toBeTruthy();
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await expect(page.getByText(/free for seekers/i)).toBeVisible();
		const blocks = (await ldJsonText(page)).join("\n");
		expect(blocks).toContain("FAQPage");
	});

	test("/about explains the marketplace", async ({ page }) => {
		const response = await page.goto("/about");
		expect(response?.ok()).toBeTruthy();
		await expect(page.getByText(/housing, meals, and pay/i).first()).toBeVisible();
	});

	test("listing detail emits JobPosting + BreadcrumbList JSON-LD", async ({ page }) => {
		const response = await page.goto("/listing/sunrise-orchard");
		expect(response?.ok()).toBeTruthy();
		const blocks = (await ldJsonText(page)).join("\n");
		expect(blocks).toContain("JobPosting");
		expect(blocks).toContain("BreadcrumbList");
	});
});
