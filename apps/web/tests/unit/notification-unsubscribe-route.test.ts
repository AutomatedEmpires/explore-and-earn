import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
	applyUnsubscribe: vi.fn(),
	renderMessage: vi.fn(),
	reportError: vi.fn(),
	verifyUnsubscribeToken: vi.fn(),
}));

vi.mock("../../services/notifications/render", () => ({
	renderMessage: routeMocks.renderMessage,
}));
vi.mock("../../services/notifications/unsubscribe", () => ({
	verifyUnsubscribeToken: routeMocks.verifyUnsubscribeToken,
}));
vi.mock("../../services/notifications/unsubscribeApply", () => ({
	applyUnsubscribe: routeMocks.applyUnsubscribe,
}));
vi.mock("../../lib/sentry", () => ({ reportError: routeMocks.reportError }));

import { GET, POST } from "../../app/api/notifications/unsubscribe/route";

const ENDPOINT = "http://localhost/api/notifications/unsubscribe?token=valid-token";
const ONE_CLICK_BODY = "List-Unsubscribe=One-Click";
const EXPECTED_CSP =
	"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

const messages: Record<string, string> = {
	"Notifications.unsubscribePage.confirmTitle": "Unsubscribe from these emails?",
	"Notifications.unsubscribePage.confirmBody": "Nothing changes until you confirm.",
	"Notifications.unsubscribePage.confirmAction": "Unsubscribe",
	"Notifications.unsubscribePage.successTitle": "You're unsubscribed",
	"Notifications.unsubscribePage.successBody": "You won't receive these emails anymore.",
	"Notifications.unsubscribePage.invalidTitle": "This link has expired",
	"Notifications.unsubscribePage.invalidBody": "This unsubscribe link is no longer valid.",
};

function urlencodedRequest(
	body = ONE_CLICK_BODY,
	url = ENDPOINT,
	contentType = "application/x-www-form-urlencoded",
): Request {
	return new Request(url, {
		method: "POST",
		headers: { "content-type": contentType },
		body,
	});
}

function expectBoundaryHeaders(response: Response): void {
	expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
	expect(response.headers.get("referrer-policy")).toBe("no-referrer");
	expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	expect(response.headers.get("content-security-policy")).toBe(EXPECTED_CSP);
	expect(response.headers.get("content-security-policy-report-only")).toBe(EXPECTED_CSP);
	expect(response.headers.get("content-security-policy-report-only")).not.toContain(
		"report-uri",
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	routeMocks.verifyUnsubscribeToken.mockReturnValue({
		clerkUserId: "clerk_u1",
		scope: "messages",
		channel: "email",
		exp: 2_000_000_000,
	});
	routeMocks.applyUnsubscribe.mockResolvedValue(undefined);
	routeMocks.renderMessage.mockImplementation(
		async (_locale: string, key: string) => messages[key] ?? key,
	);
});

describe("GET /api/notifications/unsubscribe", () => {
	it("verifies without mutating and renders a no-JS confirmation form", async () => {
		const response = await GET(new Request(ENDPOINT));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expectBoundaryHeaders(response);
		expect(routeMocks.verifyUnsubscribeToken).toHaveBeenCalledWith(
			"valid-token",
			expect.any(Number),
		);
		expect(routeMocks.applyUnsubscribe).not.toHaveBeenCalled();
		expect(html).toContain("Unsubscribe from these emails?");
		expect(html).toContain('<form method="post"');
		expect(html).not.toMatch(/<form[^>]+action=/i);
		expect(html).toContain(
			'<input type="hidden" name="List-Unsubscribe" value="One-Click" />',
		);
		expect(html).toContain('type="submit"');
		expect(html).toContain("box-sizing:border-box;min-height:48px;width:100%");
	});

	it("renders the invalid state without a form or mutation", async () => {
		routeMocks.verifyUnsubscribeToken.mockReturnValueOnce(null);
		const response = await GET(new Request(ENDPOINT));
		const html = await response.text();

		expect(response.status).toBe(200);
		expectBoundaryHeaders(response);
		expect(html).toContain("This link has expired");
		expect(html).not.toContain("<form");
		expect(routeMocks.applyUnsubscribe).not.toHaveBeenCalled();
	});

	it("escapes every translated value placed into HTML", async () => {
		routeMocks.renderMessage.mockImplementation(async (_locale: string, key: string) => {
			if (key.endsWith("confirmTitle")) return '</title><script>alert("x")</script>';
			if (key.endsWith("confirmBody")) return '<img src=x onerror="alert(1)"> & done';
			return "Unsubscribe <now>";
		});

		const response = await GET(new Request(ENDPOINT));
		const html = await response.text();

		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
		expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; done");
		expect(html).toContain("Unsubscribe &lt;now&gt;");
	});
});

describe("POST /api/notifications/unsubscribe", () => {
	it("applies an exact URL-encoded one-click request and returns a non-redirecting success page", async () => {
		const response = await POST(urlencodedRequest());
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("location")).toBeNull();
		expect(response.headers.get("content-type")).toContain("text/html");
		expectBoundaryHeaders(response);
		expect(routeMocks.applyUnsubscribe).toHaveBeenCalledTimes(1);
		expect(routeMocks.applyUnsubscribe).toHaveBeenCalledWith("clerk_u1", "messages");
		expect(html).toContain("You&#39;re unsubscribed");
	});

	it.each([
		["missing body", () => new Request(ENDPOINT, { method: "POST" })],
		[
			"unsupported content type",
			() => urlencodedRequest(ONE_CLICK_BODY, ENDPOINT, "text/plain"),
		],
		[
			"multipart form body",
			() => {
				const form = new FormData();
				form.set("List-Unsubscribe", "One-Click");
				return new Request(ENDPOINT, { method: "POST", body: form });
			},
		],
		["missing field", () => urlencodedRequest("")],
		["wrong value", () => urlencodedRequest("List-Unsubscribe=No")],
		[
			"encoded equivalent instead of exact body",
			() => urlencodedRequest("List-Unsubscribe=One%2DClick"),
		],
		["extra field", () => urlencodedRequest(`${ONE_CLICK_BODY}&extra=value`)],
		["duplicate field", () => urlencodedRequest(`${ONE_CLICK_BODY}&${ONE_CLICK_BODY}`)],
		[
			"oversized body",
			() => urlencodedRequest(`${ONE_CLICK_BODY}&padding=${"x".repeat(1024)}`),
		],
	] as const)("rejects %s without applying", async (_name, makeRequest) => {
		const response = await POST(makeRequest());

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ ok: false });
		expectBoundaryHeaders(response);
		expect(routeMocks.applyUnsubscribe).not.toHaveBeenCalled();
	});

	it("rejects an invalid or duplicated token without applying", async () => {
		routeMocks.verifyUnsubscribeToken.mockReturnValue(null);

		for (const url of [
			"http://localhost/api/notifications/unsubscribe?token=invalid",
			"http://localhost/api/notifications/unsubscribe?token=first&token=second",
		]) {
			const response = await POST(urlencodedRequest(ONE_CLICK_BODY, url));
			expect(response.status).toBe(400);
		}

		expect(routeMocks.applyUnsubscribe).not.toHaveBeenCalled();
	});

	it("sanitizes persistence failures while retaining server-side diagnostics", async () => {
		const error = new Error("sensitive database detail");
		routeMocks.applyUnsubscribe.mockRejectedValueOnce(error);

		const response = await POST(urlencodedRequest());
		const responseText = await response.text();

		expect(response.status).toBe(500);
		expect(responseText).toBe('{"ok":false}');
		expect(responseText).not.toContain("sensitive database detail");
		expectBoundaryHeaders(response);
		expect(routeMocks.reportError).toHaveBeenCalledWith(error, {
			action: "notifications.unsubscribe.post",
		});
	});
});
