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
	getLegacySeekerEmailBooleans: vi.fn(),
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
	sendEmail: vi.fn(),
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

const INVITE_INTENT: NotificationIntent = {
	...INTENT,
	sourceEventId: "event-invite",
	category: "offers_invites",
	type: "invite_received",
	destinationPath: "/invites",
	titleKey: "Notifications.types.invite_received.title",
	bodyKey: "Notifications.types.invite_received.body",
};

const APPLICATION_INTENT: NotificationIntent = {
	...INTENT,
	sourceEventId: "event-application",
	category: "applications",
	type: "application_received",
	destinationPath: "/host/applicants/application-1",
	titleKey: "Notifications.types.application_received.title",
	bodyKey: "Notifications.types.application_received.body",
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
	db.getLegacySeekerEmailBooleans.mockResolvedValue(new Map());
	db.insertDeliveries.mockResolvedValue(1);
	db.isEmailSuppressed.mockResolvedValue(false);
	db.markDigestMembershipsSent.mockResolvedValue(undefined);
	db.settleDelivery.mockResolvedValue(undefined);
	mocks.createUnsubscribeToken.mockReturnValue("signed.token");
	mocks.getClerkContact.mockResolvedValue({
		email: "seeker@example.com",
		name: "Seeker",
	});
	mocks.sendEmail.mockImplementation(async (options: {
		beforeProviderRequest?: () => Promise<
			| { readonly actionable: true }
			| { readonly actionable: false; readonly reason: string }
		>;
	}) => {
		const boundary = await options.beforeProviderRequest?.();
		if (boundary && !boundary.actionable) {
			return {
				ok: false,
				cancelledReason: boundary.reason,
				providerRequestStarted: false,
			};
		}
		return {
			ok: true,
			status: 200,
			providerMessageId: "msg_1",
			providerRequestStarted: true,
		};
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

	it("classifies a thrown provider response as outcome-unknown", async () => {
		mocks.sendEmail.mockRejectedValueOnce(new Error("connection reset"));

		await expect(
			sendNotificationEmail(INTENT, "engine-dedup-unknown", NOW),
		).resolves.toMatchObject({
			ok: false,
			retryable: true,
			outcomeUnknown: true,
			failureClass: "transient",
		});
	});
});

describe("digest email one-click headers", () => {
	it("cancels queued invitation digest members before any provider call", async () => {
		db.getQueuedDigestMemberships.mockResolvedValue([
			{
				id: "membership-invite",
				delivery_id: "source-delivery-invite",
				recipient_clerk_user_id: "clerk_seeker",
				category: "offers_invites",
				delivery: { intent: INVITE_INTENT },
			},
		]);
		db.getEnginePrefsMap.mockResolvedValue(
			new Map([
				[
					"clerk_seeker",
					{
						email_enabled: true,
						push_enabled: false,
						in_app_enabled: true,
						category_prefs: {
							offers_invites: { email: "daily", push: "off", in_app: "on" },
						},
						quiet_hours_enabled: false,
						quiet_start_minute: null,
						quiet_end_minute: null,
						timezone: "UTC",
						locale: "en",
					},
				],
			]),
		);

		await expect(runDigests("daily", NOW)).resolves.toMatchObject({
			digestsSent: 0,
			digestsFailed: 0,
		});
		expect(db.cancelDigestMemberships).toHaveBeenCalledWith(["membership-invite"]);
		expect(db.insertDeliveries).not.toHaveBeenCalled();
		expect(mocks.sendEmail).not.toHaveBeenCalled();
	});

	it("cancels a digest member when the seeker changed that category to another cadence", async () => {
		db.getQueuedDigestMemberships.mockResolvedValue([
			{
				id: "membership-old-daily",
				delivery_id: "source-delivery-old-daily",
				recipient_clerk_user_id: "clerk_seeker",
				category: "matches",
				delivery: { intent: INTENT },
			},
		]);
		db.getEnginePrefsMap.mockResolvedValue(
			new Map([
				[
					"clerk_seeker",
					{
						email_enabled: true,
						push_enabled: false,
						in_app_enabled: true,
						category_prefs: {
							matches: { email: "weekly", push: "off", in_app: "on" },
						},
						quiet_hours_enabled: false,
						quiet_start_minute: null,
						quiet_end_minute: null,
						timezone: "UTC",
						locale: "en",
					},
				],
			]),
		);

		await runDigests("daily", NOW);

		expect(db.cancelDigestMemberships).toHaveBeenCalledWith(["membership-old-daily"]);
		expect(mocks.sendEmail).not.toHaveBeenCalled();
	});

	it("preserves a legacy application-email opt-out when no engine preference row exists", async () => {
		db.getQueuedDigestMemberships.mockResolvedValue([
			{
				id: "membership-legacy-opt-out",
				delivery_id: "source-delivery-legacy-opt-out",
				recipient_clerk_user_id: "clerk_seeker",
				category: "applications",
				delivery: { intent: APPLICATION_INTENT },
			},
		]);
		db.getLegacySeekerEmailBooleans.mockResolvedValue(
			new Map([
				[
					"clerk_seeker",
					{
						email_on_invite: true,
						email_on_status_change: false,
						email_on_message: true,
					},
				],
			]),
		);

		await runDigests("daily", NOW);

		expect(db.getLegacySeekerEmailBooleans).toHaveBeenCalledWith(["clerk_seeker"]);
		expect(db.cancelDigestMemberships).toHaveBeenCalledWith([
			"membership-legacy-opt-out",
		]);
		expect(mocks.sendEmail).not.toHaveBeenCalled();
	});

	it("rechecks effective consent at the provider boundary and does not send a stale digest", async () => {
		db.getQueuedDigestMemberships.mockResolvedValue([
			{
				id: "membership-consent-race",
				delivery_id: "source-delivery-consent-race",
				recipient_clerk_user_id: "clerk_seeker",
				category: "matches",
				delivery: { intent: INTENT },
			},
		]);
		const daily = {
			email_enabled: true,
			push_enabled: false,
			in_app_enabled: true,
			category_prefs: {
				matches: { email: "daily", push: "off", in_app: "on" },
			},
			quiet_hours_enabled: false,
			quiet_start_minute: null,
			quiet_end_minute: null,
			timezone: "UTC",
			locale: "en",
		};
		const optedOut = {
			...daily,
			category_prefs: {
				matches: { email: "off", push: "off", in_app: "on" },
			},
		};
		db.getEnginePrefsMap
			.mockResolvedValueOnce(new Map([["clerk_seeker", daily]]))
			.mockResolvedValueOnce(new Map([["clerk_seeker", optedOut]]));

		await expect(runDigests("daily", NOW)).resolves.toMatchObject({
			digestsSent: 0,
			digestsSkipped: 1,
			digestsFailed: 0,
		});

		expect(db.getEnginePrefsMap).toHaveBeenCalledTimes(2);
		expect(db.cancelDigestMemberships).toHaveBeenCalledWith([
			"membership-consent-race",
		]);
		expect(db.settleDelivery).toHaveBeenCalledWith({
			id: "digest-delivery-1",
			status: "deferred",
			nextAttemptAt: "9999-01-01T00:00:00.000Z",
		});
		expect(db.markDigestMembershipsSent).not.toHaveBeenCalled();
		expect(db.collapseDeliveriesInto).not.toHaveBeenCalled();
	});

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
