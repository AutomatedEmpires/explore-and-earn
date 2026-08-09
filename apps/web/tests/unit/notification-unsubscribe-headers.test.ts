import type { NotificationIntent } from "@explore-and-earn/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
	adminHostClerkId: vi.fn(),
	adminListingContext: vi.fn(),
	adminSeekerClerkId: vi.fn(),
	cancelDigestMemberships: vi.fn(),
	claimDigestDelivery: vi.fn(),
	collapseDeliveriesInto: vi.fn(),
	getDeliveryByDedupKey: vi.fn(),
	getEnginePrefsMap: vi.fn(),
	getExpiringLiveListings: vi.fn(),
	getExpiringOfferedApplications: vi.fn(),
	getQueuedDigestMemberships: vi.fn(),
	getResumeCompletionByProfileId: vi.fn(),
	getResumeNudgeCandidates: vi.fn(),
	insertDeliveries: vi.fn(),
	isEmailSuppressed: vi.fn(),
	markDigestMembershipsSent: vi.fn(),
	settleDelivery: vi.fn(),
}));
vi.mock("@explore-and-earn/db", () => db);

const mocks = vi.hoisted(() => ({
	createUnsubscribeToken: vi.fn(() => "signed.token"),
	getClerkContact: vi.fn(async () => ({
		email: "seeker@example.com",
		name: "Seeker",
	})),
	renderMessage: vi.fn(async (
		_locale: string,
		key: string,
		_values: Record<string, unknown>,
		fallback?: string,
	) => fallback ?? key),
	renderNotification: vi.fn(async () => ({
		locale: "en",
		title: "A new opportunity",
		body: "Review the details.",
	})),
	sendEmail: vi.fn(async () => ({
		ok: true,
		status: 200,
		providerMessageId: "msg_1",
	})),
}));

vi.mock("../../lib/clerkUser", () => ({
	getClerkContact: (...args: unknown[]) => mocks.getClerkContact(...(args as [])),
}));
vi.mock("../../lib/email", () => ({
	absoluteUrl: (path: string) => {
		const base =
			process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
			"https://exploreandearn.com";
		const suffix = path.startsWith("/") ? path : `/${path}`;
		return `${base}${suffix}`;
	},
	sendEmail: (...args: unknown[]) => mocks.sendEmail(...(args as [])),
}));
vi.mock("../../lib/emails/layout", () => ({
	escapeHtml: (value: string) => value,
	renderEmailLayout: () => "<html>notification</html>",
}));
vi.mock("../../lib/sentry", () => ({ reportError: vi.fn() }));
vi.mock("../../services/notifications/dispatcher", () => ({
	enqueueScheduleDerived: vi.fn(),
}));
vi.mock("../../services/notifications/render", () => ({
	localizedPath: (_locale: string, path: string) => path,
	renderMessage: (...args: unknown[]) => mocks.renderMessage(...(args as [])),
	renderNotification: (...args: unknown[]) => mocks.renderNotification(...(args as [])),
}));
vi.mock("../../services/notifications/unsubscribe", () => ({
	createUnsubscribeToken: (...args: unknown[]) =>
		mocks.createUnsubscribeToken(...(args as [])),
}));

import { sendNotificationEmail } from "../../services/notifications/channels/email";
import { runDigests } from "../../services/notifications/digests";
import { buildListUnsubscribeHeaders } from "../../services/notifications/unsubscribeHeaders";

const NOW = Date.parse("2026-01-05T09:00:00.000Z");
const UNSUBSCRIBE_URL =
	"https://exploreandearn.com/api/notifications/unsubscribe?token=signed.token";
const ONE_CLICK_HEADERS = {
	"List-Unsubscribe": `<${UNSUBSCRIBE_URL}>`,
	"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
};

const INTENT: NotificationIntent = {
	sourceEventId: "event-1",
	sourceOccurredAt: "2026-01-05T08:00:00.000Z",
	recipientClerkUserId: "clerk_seeker",
	category: "matches",
	type: "new_strong_match",
	variant: "default",
	locale: "en",
	destinationPath: "/jobs/listing-1",
	titleKey: "Notifications.types.new_strong_match.title",
	bodyKey: "Notifications.types.new_strong_match.body",
	values: { listingTitle: "Deckhand" },
	urgent: false,
};

async function runDailyDigest(): Promise<void> {
	db.getQueuedDigestMemberships.mockResolvedValue([
		{
			id: "membership-1",
			delivery_id: "source-delivery-1",
			recipient_clerk_user_id: "clerk_seeker",
			category: "matches",
			delivery: { intent: INTENT },
		},
	]);

	const result = await runDigests("daily", NOW);
	expect(result.digestsSent).toBe(1);
}

beforeEach(() => {
	vi.clearAllMocks();
	db.cancelDigestMemberships.mockResolvedValue(undefined);
	db.claimDigestDelivery.mockResolvedValue(true);
	db.collapseDeliveriesInto.mockResolvedValue(undefined);
	db.getDeliveryByDedupKey.mockResolvedValue({
		id: "digest-delivery-1",
		status: "deferred",
	});
	db.getEnginePrefsMap.mockResolvedValue(new Map());
	db.insertDeliveries.mockResolvedValue(1);
	db.isEmailSuppressed.mockResolvedValue(false);
	db.markDigestMembershipsSent.mockResolvedValue(undefined);
	db.settleDelivery.mockResolvedValue(undefined);
	mocks.createUnsubscribeToken.mockReturnValue("signed.token");
	mocks.getClerkContact.mockResolvedValue({
		email: "seeker@example.com",
		name: "Seeker",
	});
	mocks.sendEmail.mockResolvedValue({
		ok: true,
		status: 200,
		providerMessageId: "msg_1",
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("buildListUnsubscribeHeaders", () => {
	it("returns the exact RFC 8058 pair for a valid HTTPS URL", () => {
		expect(buildListUnsubscribeHeaders(UNSUBSCRIBE_URL)).toEqual(ONE_CLICK_HEADERS);
	});

	it.each([
		"http://localhost:3000/api/notifications/unsubscribe?token=signed.token",
		"https://user:password@exploreandearn.com/api/notifications/unsubscribe?token=signed.token",
		"https://exploreandearn.com/api/notifications/unsubscribe?token=signed.token#ignored",
		"not a valid URL",
		"/api/notifications/unsubscribe?token=signed.token",
	])("returns no headers for a non-HTTPS or malformed URL: %s", (url) => {
		expect(buildListUnsubscribeHeaders(url)).toBeUndefined();
	});
});

describe("notification email one-click headers", () => {
	it("attaches the exact pair when the configured origin is HTTPS", async () => {
		await sendNotificationEmail(INTENT, "engine-dedup-1", NOW);

		expect(mocks.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ headers: ONE_CLICK_HEADERS }),
		);
	});

	it("omits one-click headers when the configured origin is HTTP", async () => {
		vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

		await sendNotificationEmail(INTENT, "engine-dedup-2", NOW);

		expect(mocks.sendEmail.mock.calls[0]?.[0]).not.toHaveProperty("headers");
	});
});

describe("digest email one-click headers", () => {
	it("attaches the exact pair when the configured origin is HTTPS", async () => {
		await runDailyDigest();

		expect(mocks.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ headers: ONE_CLICK_HEADERS }),
		);
	});

	it("omits one-click headers when the configured origin is malformed", async () => {
		vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a valid origin");

		await runDailyDigest();

		expect(mocks.sendEmail.mock.calls[0]?.[0]).not.toHaveProperty("headers");
	});
});
