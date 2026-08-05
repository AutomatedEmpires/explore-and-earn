/**
 * Dispatcher invariants:
 *
 *  - EXACTLY-ONCE (logical): expansion materializes deliveries keyed by the
 *    contract dedup key and watermarks every event — including events that
 *    expand to nothing; failed expansion leaves the event UNwatermarked.
 *  - PREFERENCES: channels the user turned off are never materialized;
 *    digest cadences become held rows + memberships, not live sends.
 *  - QUIET HOURS defer outbound sends to the user-local window end.
 *  - THROTTLE defers (never drops) over-budget outbound sends; urgent exempt.
 *  - STALENESS re-check cancels dead reminders instead of sending them.
 *  - RETRIES: bounded with backoff; the attempt budget dead-letters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
	adminApplicationContext: vi.fn(),
	adminConversationContext: vi.fn(),
	adminHostClerkId: vi.fn(),
	adminListingContext: vi.fn(),
	adminSeekerClerkId: vi.fn(),
	adminSchedulingContext: vi.fn(),
	claimDeliveries: vi.fn(),
	countRecentOutboundDeliveries: vi.fn(),
	findOpenCollapsibleDeliveries: vi.fn(),
	getDeliveryIdsByDedupKeys: vi.fn(),
	getEnginePrefsMap: vi.fn(),
	getLegacySeekerEmailBooleans: vi.fn(),
	getUnprocessedEvents: vi.fn(),
	insertDeliveries: vi.fn(),
	insertDigestMemberships: vi.fn(),
	markEventProcessed: vi.fn(),
	settleDelivery: vi.fn(),
	getApplicationOfferState: vi.fn(),
	getListingLiveState: vi.fn(),
	getResumeCompletionByProfileId: vi.fn(),
	insertEngineNotification: vi.fn(),
	isEmailSuppressed: vi.fn(),
	getActivePushSubscriptions: vi.fn(),
	recordPushOutcome: vi.fn(),
	revokePushSubscription: vi.fn(),
}));
vi.mock("@explore-and-earn/db", () => db);

vi.mock("../../lib/clerkUser", () => ({
	getClerkContact: vi.fn(async () => ({ email: "seeker@example.com", name: "Seeker" })),
}));

const sendEmailMock = vi.hoisted(() =>
	vi.fn(async () => ({ ok: true, status: 200, providerMessageId: "msg_1" }) as {
		ok: boolean;
		status?: number;
		providerMessageId?: string;
		error?: string;
	}),
);
vi.mock("../../lib/email", () => ({
	sendEmail: (...args: unknown[]) => sendEmailMock(...(args as [])),
	absoluteUrl: (path: string) => `https://exploreandearn.com${path}`,
}));

import {
	enqueueScheduleDerived,
	expandPendingEvents,
	processDueDeliveries,
} from "../../services/notifications/dispatcher";

const EVENT = {
	id: "evt-1",
	event_type: "application_submitted",
	actor_scope: "seeker",
	subject_type: "application",
	subject_id: "app-1",
	listing_id: "listing-1",
	host_profile_id: null,
	seeker_profile_id: "seeker-prof-1",
	properties: {},
	occurred_at: "2026-07-14T12:00:00.000Z",
};

function wireHappyResolvers() {
	db.adminSeekerClerkId.mockResolvedValue("clerk_seeker");
	db.adminHostClerkId.mockResolvedValue("clerk_host");
	db.adminListingContext.mockResolvedValue({ title: "Deckhand", hostProfileId: "host-prof-1" });
	db.adminApplicationContext.mockResolvedValue({
		seekerProfileId: "seeker-prof-1",
		listingId: "listing-1",
	});
	db.adminConversationContext.mockResolvedValue(null);
	db.adminSchedulingContext.mockResolvedValue({
		applicationId: "app-1",
		seekerProfileId: "seeker-prof-1",
		listingId: "listing-1",
		hostProfileId: "host-prof-1",
		listingTitle: "Deckhand",
		status: "proposed",
		currentRound: 1,
		expiresAt: "2026-07-17T12:00:00.000Z",
	});
}

const NOW = Date.parse("2026-07-14T15:00:00.000Z");

function claimedDelivery(overrides: Record<string, unknown> = {}) {
	return {
		id: "del-1",
		event_id: "evt-1",
		recipient_clerk_user_id: "clerk_host",
		channel: "email",
		category: "applications",
		notification_type: "application_received",
		variant: "default",
		dedup_key: "evt-1␟clerk_host␟applications␟email␟default",
		status: "processing",
		attempt_count: 1,
		next_attempt_at: new Date(NOW).toISOString(),
		cadence: "immediate",
		created_at: new Date(NOW - 60_000).toISOString(),
		intent: {
			sourceEventId: "evt-1",
			sourceOccurredAt: "2026-07-14T12:00:00.000Z",
			recipientClerkUserId: "clerk_host",
			category: "applications",
			type: "application_received",
			variant: "default",
			locale: "en",
			destinationPath: "/host/applicants/app-1",
			titleKey: "Notifications.types.application_received.title",
			bodyKey: "Notifications.types.application_received.body",
			values: { listingTitle: "Deckhand" },
			urgent: false,
		},
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	db.getEnginePrefsMap.mockResolvedValue(new Map());
	db.getLegacySeekerEmailBooleans.mockResolvedValue(new Map());
	db.insertDeliveries.mockResolvedValue(1);
	db.insertDigestMemberships.mockResolvedValue(0);
	db.getDeliveryIdsByDedupKeys.mockResolvedValue(new Map());
	db.markEventProcessed.mockResolvedValue(undefined);
	db.settleDelivery.mockResolvedValue(undefined);
	db.countRecentOutboundDeliveries.mockResolvedValue(0);
	db.findOpenCollapsibleDeliveries.mockResolvedValue([]);
	db.isEmailSuppressed.mockResolvedValue(false);
	db.insertEngineNotification.mockResolvedValue({ inserted: true, duplicate: false });
	sendEmailMock.mockResolvedValue({ ok: true, status: 200, providerMessageId: "msg_1" });
	wireHappyResolvers();
});

describe("expansion — exactly-once materialization", () => {
	it("materializes dedup-keyed deliveries and watermarks the event", async () => {
		db.getUnprocessedEvents.mockResolvedValue([EVENT]);
		const stats = await expandPendingEvents();

		expect(stats.eventsProcessed).toBe(1);
		const rows = db.insertDeliveries.mock.calls[0][0] as Array<Record<string, unknown>>;
		// Default prefs: applications = in_app + immediate email + push (push
		// master OFF by default → no push row).
		const channels = rows.map((row) => row.channel).sort();
		expect(channels).toEqual(["email", "in_app"]);
		for (const row of rows) {
			expect(row.eventId).toBe("evt-1");
			expect(String(row.dedupKey)).toContain("evt-1");
			expect(String(row.dedupKey)).toContain("clerk_host");
		}
		expect(db.markEventProcessed).toHaveBeenCalledWith("evt-1", rows.length);
	});

	it("watermarks no-notification events WITHOUT creating deliveries", async () => {
		db.getUnprocessedEvents.mockResolvedValue([
			{ ...EVENT, event_type: "search_performed" },
		]);
		await expandPendingEvents();
		expect(db.insertDeliveries).not.toHaveBeenCalled();
		expect(db.markEventProcessed).toHaveBeenCalledWith("evt-1", 0);
	});

	it("leaves the event UNwatermarked when expansion fails (retried next run)", async () => {
		db.getUnprocessedEvents.mockResolvedValue([EVENT]);
		db.adminListingContext.mockRejectedValue(new Error("db down"));
		const stats = await expandPendingEvents();
		expect(stats.expansionErrors).toBe(1);
		expect(db.markEventProcessed).not.toHaveBeenCalled();
	});

	it("leaves a scheduling event unwatermarked when context resolution is transiently down", async () => {
		db.getUnprocessedEvents.mockResolvedValue([
			{
				...EVENT,
				event_type: "scheduling_request_sent",
				subject_type: "scheduling_request",
				subject_id: "schedule-1",
			},
		]);
		db.adminSchedulingContext.mockRejectedValue(new Error("db down"));
		const stats = await expandPendingEvents();
		expect(stats.expansionErrors).toBe(1);
		expect(db.markEventProcessed).not.toHaveBeenCalled();
	});

	it("watermarks a scheduling event with a genuinely missing subject as zero deliveries", async () => {
		db.getUnprocessedEvents.mockResolvedValue([
			{
				...EVENT,
				event_type: "scheduling_request_sent",
				subject_type: "scheduling_request",
				subject_id: "schedule-missing",
			},
		]);
		db.adminSchedulingContext.mockResolvedValue(null);
		await expandPendingEvents();
		expect(db.insertDeliveries).not.toHaveBeenCalled();
		expect(db.markEventProcessed).toHaveBeenCalledWith("evt-1", 0);
	});

	it("digest cadence becomes a HELD row + membership, never a live send", async () => {
		// Matches category defaults to a daily email digest.
		db.getUnprocessedEvents.mockResolvedValue([
			{
				...EVENT,
				event_type: "match_generated",
				subject_type: "listing",
				subject_id: "listing-1",
			},
		]);
		db.getDeliveryIdsByDedupKeys.mockResolvedValue(new Map([["k", "id"]]));
		await expandPendingEvents();

		const rows = db.insertDeliveries.mock.calls[0][0] as Array<Record<string, unknown>>;
		const emailRow = rows.find((row) => row.channel === "email");
		expect(emailRow?.cadence).toBe("daily");
		expect(emailRow?.status).toBe("deferred");
		expect(String(emailRow?.nextAttemptAt)).toContain("9999");
		expect(db.insertDigestMemberships).toHaveBeenCalledTimes(1);
		const memberships = db.insertDigestMemberships.mock.calls[0][0] as Array<
			Record<string, unknown>
		>;
		expect(memberships[0].cadence).toBe("daily");
		expect(memberships[0].eventId).toBe("evt-1");
	});

	it("honors an explicit opt-out — no delivery rows for disabled channels", async () => {
		db.getEnginePrefsMap.mockResolvedValue(
			new Map([
				[
					"clerk_host",
					{
						clerk_user_id: "clerk_host",
						email_enabled: false,
						push_enabled: false,
						in_app_enabled: true,
						category_prefs: {},
						quiet_hours_enabled: false,
						quiet_start_minute: null,
						quiet_end_minute: null,
						timezone: null,
						locale: null,
					},
				],
			]),
		);
		db.getUnprocessedEvents.mockResolvedValue([EVENT]);
		await expandPendingEvents();
		const rows = db.insertDeliveries.mock.calls[0][0] as Array<Record<string, unknown>>;
		expect(rows.map((row) => row.channel)).toEqual(["in_app"]);
	});

	it("legacy 019 opt-outs keep holding for users WITHOUT an engine row", async () => {
		db.getLegacySeekerEmailBooleans.mockResolvedValue(
			new Map([
				[
					"clerk_seeker",
					{ email_on_invite: false, email_on_status_change: true, email_on_message: true },
				],
			]),
		);
		db.getUnprocessedEvents.mockResolvedValue([
			{
				...EVENT,
				event_type: "invite_created",
				actor_scope: "host",
				subject_type: "invite",
				subject_id: "invite-1",
				host_profile_id: "host-prof-1",
			},
		]);
		await expandPendingEvents();
		const rows = db.insertDeliveries.mock.calls[0][0] as Array<Record<string, unknown>>;
		expect(rows.map((row) => row.channel)).toEqual(["in_app"]);
	});
});

describe("delivery — quiet hours, throttle, collapse, staleness", () => {
	it("defers outbound sends inside the user's quiet hours (DST-safe local)", async () => {
		db.getEnginePrefsMap.mockResolvedValue(
			new Map([
				[
					"clerk_host",
					{
						clerk_user_id: "clerk_host",
						email_enabled: true,
						push_enabled: false,
						in_app_enabled: true,
						category_prefs: {},
						quiet_hours_enabled: true,
						quiet_start_minute: 0,
						quiet_end_minute: 1439, // quiet nearly all day in UTC
						timezone: "UTC",
						locale: null,
					},
				],
			]),
		);
		db.claimDeliveries.mockResolvedValue([claimedDelivery()]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.deferred).toBe(1);
		expect(sendEmailMock).not.toHaveBeenCalled();
		const settle = db.settleDelivery.mock.calls[0][0];
		expect(settle.status).toBe("deferred");
		expect(Date.parse(settle.nextAttemptAt)).toBeGreaterThan(NOW);
	});

	it("in-app deliveries IGNORE quiet hours (they just sit unread)", async () => {
		db.getEnginePrefsMap.mockResolvedValue(
			new Map([
				[
					"clerk_host",
					{
						clerk_user_id: "clerk_host",
						email_enabled: true,
						push_enabled: false,
						in_app_enabled: true,
						category_prefs: {},
						quiet_hours_enabled: true,
						quiet_start_minute: 0,
						quiet_end_minute: 1439,
						timezone: "UTC",
						locale: null,
					},
				],
			]),
		);
		db.claimDeliveries.mockResolvedValue([claimedDelivery({ channel: "in_app" })]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.delivered).toBe(1);
		expect(db.insertEngineNotification).toHaveBeenCalledTimes(1);
	});

	it("throttles over-budget outbound sends by DEFERRING, and exempts urgent", async () => {
		db.countRecentOutboundDeliveries.mockResolvedValue(99);
		db.claimDeliveries.mockResolvedValue([claimedDelivery()]);
		let stats = await processDueDeliveries(NOW);
		expect(stats.deferred).toBe(1);
		expect(sendEmailMock).not.toHaveBeenCalled();

		vi.clearAllMocks();
		db.getEnginePrefsMap.mockResolvedValue(new Map());
		db.getLegacySeekerEmailBooleans.mockResolvedValue(new Map());
		db.countRecentOutboundDeliveries.mockResolvedValue(99);
		db.findOpenCollapsibleDeliveries.mockResolvedValue([]);
		db.isEmailSuppressed.mockResolvedValue(false);
		db.settleDelivery.mockResolvedValue(undefined);
		sendEmailMock.mockResolvedValue({ ok: true, status: 200 });
		db.claimDeliveries.mockResolvedValue([
			claimedDelivery({
				intent: { ...claimedDelivery().intent, urgent: true },
			}),
		]);
		stats = await processDueDeliveries(NOW);
		expect(stats.delivered).toBe(1);
	});

	it("collapses a burst: an OLDER open same-key delivery is cancelled into the newer", async () => {
		db.claimDeliveries.mockResolvedValue([
			claimedDelivery({
				intent: { ...claimedDelivery().intent, collapseKey: "conversation:c1" },
			}),
		]);
		db.findOpenCollapsibleDeliveries.mockResolvedValue([
			{
				id: "del-newer",
				dedup_key: "other",
				created_at: new Date(NOW + 5_000).toISOString(),
			},
		]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.cancelled).toBe(1);
		const settle = db.settleDelivery.mock.calls[0][0];
		expect(settle.status).toBe("cancelled");
		expect(settle.collapsedIntoDeliveryId).toBe("del-newer");
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it("cancels a stale offer_expiring instead of sending a false reminder", async () => {
		db.getApplicationOfferState.mockResolvedValue({ status: "accepted", expires_at: null });
		db.claimDeliveries.mockResolvedValue([
			claimedDelivery({
				notification_type: "offer_expiring",
				intent: {
					...claimedDelivery().intent,
					type: "offer_expiring",
					entity: { type: "application", id: "app-1" },
					urgent: true,
				},
			}),
		]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.cancelled).toBe(1);
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it("suppressed email settles as suppressed, not failed", async () => {
		db.isEmailSuppressed.mockResolvedValue(true);
		db.claimDeliveries.mockResolvedValue([claimedDelivery()]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.suppressed).toBe(1);
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(db.settleDelivery.mock.calls[0][0].status).toBe("suppressed");
	});

	it("retryable failures back off; the attempt budget dead-letters", async () => {
		sendEmailMock.mockResolvedValue({ ok: false, status: 503, error: "unavailable" });
		db.claimDeliveries.mockResolvedValue([claimedDelivery({ attempt_count: 1 })]);
		await processDueDeliveries(NOW);
		let settle = db.settleDelivery.mock.calls[0][0];
		expect(settle.status).toBe("failed_retryable");
		expect(Date.parse(settle.nextAttemptAt)).toBeGreaterThan(NOW);

		vi.clearAllMocks();
		db.getEnginePrefsMap.mockResolvedValue(new Map());
		db.getLegacySeekerEmailBooleans.mockResolvedValue(new Map());
		db.countRecentOutboundDeliveries.mockResolvedValue(0);
		db.findOpenCollapsibleDeliveries.mockResolvedValue([]);
		db.isEmailSuppressed.mockResolvedValue(false);
		db.settleDelivery.mockResolvedValue(undefined);
		sendEmailMock.mockResolvedValue({ ok: false, status: 503, error: "unavailable" });
		db.claimDeliveries.mockResolvedValue([claimedDelivery({ attempt_count: 5 })]);
		await processDueDeliveries(NOW);
		settle = db.settleDelivery.mock.calls[0][0];
		expect(settle.status).toBe("dead_letter");
	});

	it("terminal failures never retry", async () => {
		sendEmailMock.mockResolvedValue({ ok: false, status: 422, error: "bad request" });
		db.claimDeliveries.mockResolvedValue([claimedDelivery()]);
		await processDueDeliveries(NOW);
		expect(db.settleDelivery.mock.calls[0][0].status).toBe("failed_terminal");
	});

	it("an unparsable persisted intent dead-letters instead of crashing the batch", async () => {
		db.claimDeliveries.mockResolvedValue([
			claimedDelivery({ intent: { garbage: true } }),
			claimedDelivery({ id: "del-2", dedup_key: "other␟key" }),
		]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.failed).toBe(1);
		expect(stats.delivered).toBe(1);
	});
});

describe("schedule-derived enqueue", () => {
	it("creates channel deliveries with caller-provided dedup identity and NO event id", async () => {
		await enqueueScheduleDerived([
			{
				dedupBase: "resume_nudge␟clerk_seeker␟1470",
				intent: {
					sourceEventId: "",
					sourceOccurredAt: new Date(NOW).toISOString(),
					recipientClerkUserId: "clerk_seeker",
					category: "account_progress",
					type: "resume_nudge",
					variant: "default",
					destinationPath: "/resume",
					titleKey: "Notifications.types.resume_nudge.title",
					bodyKey: "Notifications.types.resume_nudge.body",
					values: { completion: 40 },
					entity: { type: "seeker_profile", id: "seeker-prof-1" },
					urgent: false,
				},
			},
		]);
		const rows = db.insertDeliveries.mock.calls[0][0] as Array<Record<string, unknown>>;
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.eventId).toBeNull();
			expect(String(row.dedupKey)).toContain("resume_nudge␟clerk_seeker␟1470");
			// Schedule-derived reminders always enqueue immediate (the generating
			// cron IS the schedule).
			expect(row.cadence).toBe("immediate");
		}
	});
});

describe("staged activation (NOTIFICATION_ENGINE_STAGE)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("disabled: dispatch passes never touch the ledger (safe pre-065)", async () => {
		vi.stubEnv("NOTIFICATION_ENGINE_STAGE", "disabled");
		const expansion = await expandPendingEvents();
		expect(expansion.eventsProcessed).toBe(0);
		expect(db.getUnprocessedEvents).not.toHaveBeenCalled();

		const delivery = await processDueDeliveries(NOW);
		expect(delivery.claimed).toBe(0);
		expect(db.claimDeliveries).not.toHaveBeenCalled();

		const enqueued = await enqueueScheduleDerived([
			{
				dedupBase: "offer_expiring␟app-1",
				intent: {
					sourceEventId: "",
					sourceOccurredAt: new Date(NOW).toISOString(),
					recipientClerkUserId: "clerk_host",
					category: "offers_invites",
					type: "offer_expiring",
					variant: "default",
					destinationPath: "/offered",
					titleKey: "t",
					bodyKey: "b",
					values: {},
					urgent: true,
				},
			},
		]);
		expect(enqueued).toBe(0);
		expect(db.insertDeliveries).not.toHaveBeenCalled();
	});

	it("ledger_only: expansion runs; would-sends settle suppressed with the stage reason (in-app included)", async () => {
		vi.stubEnv("NOTIFICATION_ENGINE_STAGE", "ledger_only");
		db.claimDeliveries.mockResolvedValue([
			claimedDelivery(),
			claimedDelivery({ id: "del-2", channel: "in_app" }),
		]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.suppressed).toBe(2);
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(db.insertEngineNotification).not.toHaveBeenCalled();
		for (const call of db.settleDelivery.mock.calls) {
			expect(call[0].status).toBe("suppressed");
			expect(call[0].suppressionReason).toBe("stage:ledger_only");
		}
	});

	it("internal_preview: only allowlisted recipients get real delivery", async () => {
		vi.stubEnv("NOTIFICATION_ENGINE_STAGE", "internal_preview");
		vi.stubEnv("NOTIFICATION_INTERNAL_ALLOWLIST", "clerk_host, clerk_other");
		db.claimDeliveries.mockResolvedValue([
			claimedDelivery(), // clerk_host — allowlisted
			claimedDelivery({
				id: "del-2",
				recipient_clerk_user_id: "clerk_outsider",
				dedup_key: "evt-1␟clerk_outsider␟applications␟email␟default",
				intent: { ...claimedDelivery().intent, recipientClerkUserId: "clerk_outsider" },
			}),
		]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.delivered).toBe(1);
		expect(stats.suppressed).toBe(1);
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		const suppressCall = db.settleDelivery.mock.calls.find(
			(call) => call[0].status === "suppressed",
		);
		expect(suppressCall?.[0].suppressionReason).toBe("stage:internal_preview");
	});

	it("limited: the allowlist always sends; percent=0 gates everyone else deterministically", async () => {
		vi.stubEnv("NOTIFICATION_ENGINE_STAGE", "limited");
		vi.stubEnv("NOTIFICATION_INTERNAL_ALLOWLIST", "clerk_host");
		vi.stubEnv("NOTIFICATION_LIMITED_PERCENT", "0");
		db.claimDeliveries.mockResolvedValue([
			claimedDelivery(),
			claimedDelivery({
				id: "del-2",
				recipient_clerk_user_id: "clerk_outsider",
				dedup_key: "evt-1␟clerk_outsider␟applications␟email␟default",
				intent: { ...claimedDelivery().intent, recipientClerkUserId: "clerk_outsider" },
			}),
		]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.delivered).toBe(1);
		expect(stats.suppressed).toBe(1);
	});

	it("stage gating happens AFTER recheck/consent/collapse so the ledger stays honest", async () => {
		vi.stubEnv("NOTIFICATION_ENGINE_STAGE", "ledger_only");
		// A stale reminder must settle 'cancelled' (recheck), not stage-suppressed.
		db.getApplicationOfferState.mockResolvedValue(null);
		db.claimDeliveries.mockResolvedValue([
			claimedDelivery({
				notification_type: "offer_expiring",
				intent: {
					...claimedDelivery().intent,
					type: "offer_expiring",
					category: "offers_invites",
					entity: { type: "application", id: "app-1" },
					urgent: true,
				},
			}),
		]);
		const stats = await processDueDeliveries(NOW);
		expect(stats.cancelled).toBe(1);
		expect(stats.suppressed).toBe(0);
	});
});
