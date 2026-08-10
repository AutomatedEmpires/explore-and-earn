/**
 * Timing primitives across the notification engine:
 *
 *  - evaluateQuietHours (@explore-and-earn/contracts): DST-safe, IANA-timezone
 *    quiet-hours evaluation — deterministic fallback (never quiet) on
 *    disabled/missing/invalid config, half-open [start, end) windows,
 *    overnight wraparound, and the zero-length "disabled, not always-on" rule.
 *  - backoff.ts: bounded exponential backoff with full jitter, provider
 *    failure classification, and the attempt-budget cutoff.
 *  - digests.ts localNow/dueWindowKey: recipient-local wall clock (IANA,
 *    invalid → UTC fallback) and the 08:00-local due-window computation for
 *    daily/weekly digests.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// digests.ts transitively imports the full notification module graph
// (dispatcher.ts → channels/*, prefs, recheck, taxonomy). Every
// @explore-and-earn/db export reachable from that graph is stubbed here so
// the module loads without touching a real database; localNow/dueWindowKey
// are pure and never call any of these.
const dbMocks = vi.hoisted(() => ({
	adminApplicationContext: vi.fn(),
	adminConversationContext: vi.fn(),
	adminHostClerkId: vi.fn(),
	adminListingContext: vi.fn(),
	adminSeekerClerkId: vi.fn(),
	claimDeliveries: vi.fn(),
	collapseDeliveriesInto: vi.fn(),
	countRecentOutboundDeliveries: vi.fn(),
	findOpenCollapsibleDeliveries: vi.fn(),
	getActivePushSubscriptions: vi.fn(),
	getApplicationOfferState: vi.fn(),
	getDeliveryByDedupKey: vi.fn(),
	getDeliveryIdsByDedupKeys: vi.fn(),
	getEnginePrefsMap: vi.fn(),
	getInviteNotificationState: vi.fn(),
	getExpiringLiveListings: vi.fn(),
	getExpiringOfferedApplications: vi.fn(),
	getLegacySeekerEmailBooleans: vi.fn(),
	getListingLiveState: vi.fn(),
	getQueuedDigestMemberships: vi.fn(),
	getResumeCompletionByProfileId: vi.fn(),
	getResumeNudgeCandidates: vi.fn(),
	getUnprocessedEvents: vi.fn(),
	insertDeliveries: vi.fn(),
	insertDigestMemberships: vi.fn(),
	insertEngineNotification: vi.fn(),
	isEmailSuppressed: vi.fn(),
	markDigestMembershipsSent: vi.fn(),
	markEventProcessed: vi.fn(),
	recordPushOutcome: vi.fn(),
	revokePushSubscription: vi.fn(),
	settleDelivery: vi.fn(),
	settleInviteNotificationDelivery: vi.fn(),
	adminClient: vi.fn(),
}));
vi.mock("@explore-and-earn/db", () => dbMocks);

// Same rationale as notification-dispatcher.test.ts: sidestep real
// @clerk/nextjs/server and mailer transport imports for a module graph we
// only exercise for its pure timing helpers.
vi.mock("../../lib/clerkUser", () => ({
	getClerkContact: vi.fn(async () => ({ email: null, name: null })),
}));
vi.mock("../../lib/email", () => ({
	sendEmail: vi.fn(),
	absoluteUrl: (path: string) => `https://exploreandearn.com${path}`,
}));

import { evaluateQuietHours, type QuietHours } from "@explore-and-earn/contracts";

import {
	classifyHttpFailure,
	isRetryable,
	MAX_DELIVERY_ATTEMPTS,
	nextAttemptAtMs,
} from "../../services/notifications/backoff";
import { dueWindowKey, localNow } from "../../services/notifications/digests";

function quiet(overrides: Partial<QuietHours> = {}): QuietHours {
	return {
		enabled: true,
		startMinute: 60, // 01:00
		endMinute: 300, // 05:00
		timezone: "UTC",
		...overrides,
	};
}

describe("evaluateQuietHours", () => {
	it("is never quiet when disabled", () => {
		const result = evaluateQuietHours(quiet({ enabled: false }), Date.UTC(2026, 0, 5, 2, 0));
		expect(result).toEqual({ quiet: false, resumeAtMs: null });
	});

	it("is never quiet when timezone is null", () => {
		const result = evaluateQuietHours(quiet({ timezone: null }), Date.UTC(2026, 0, 5, 2, 0));
		expect(result).toEqual({ quiet: false, resumeAtMs: null });
	});

	it("is never quiet for an invalid IANA timezone", () => {
		const result = evaluateQuietHours(
			quiet({ timezone: "Not/AZone" }),
			Date.UTC(2026, 0, 5, 2, 0),
		);
		expect(result).toEqual({ quiet: false, resumeAtMs: null });
	});

	it("a simple same-day window (01:00-05:00 UTC) is quiet at 02:00 with resumeAtMs at 05:00 exactly", () => {
		const nowMs = Date.UTC(2026, 0, 5, 2, 0);
		const result = evaluateQuietHours(quiet(), nowMs);
		expect(result.quiet).toBe(true);
		expect(result.resumeAtMs).toBe(Date.UTC(2026, 0, 5, 5, 0));
	});

	it("the window end is exclusive — exactly 05:00 is not quiet", () => {
		const result = evaluateQuietHours(quiet(), Date.UTC(2026, 0, 5, 5, 0));
		expect(result).toEqual({ quiet: false, resumeAtMs: null });
	});

	it("an overnight window (22:00-07:00) wraps past midnight", () => {
		const overnight = quiet({ startMinute: 1320, endMinute: 420 });
		expect(evaluateQuietHours(overnight, Date.UTC(2026, 0, 5, 23, 0)).quiet).toBe(true);
		expect(evaluateQuietHours(overnight, Date.UTC(2026, 0, 5, 3, 0)).quiet).toBe(true);
		expect(evaluateQuietHours(overnight, Date.UTC(2026, 0, 5, 12, 0)).quiet).toBe(false);
	});

	it("a zero-length window (start === end) is never quiet — disabled, not always-on", () => {
		const zeroLength = quiet({ startMinute: 600, endMinute: 600 });
		const result = evaluateQuietHours(zeroLength, Date.UTC(2026, 0, 5, 10, 0));
		expect(result).toEqual({ quiet: false, resumeAtMs: null });
	});

	it("evaluates in the user's IANA timezone, DST-correct (America/New_York, January, UTC-5)", () => {
		// 2026-01-06T04:00:00Z is 2026-01-05T23:00 in America/New_York (no DST
		// in January) — inside an overnight 22:00-07:00 quiet window.
		const nowMs = Date.UTC(2026, 0, 6, 4, 0);
		const overnight = quiet({ startMinute: 1320, endMinute: 420, timezone: "America/New_York" });
		const result = evaluateQuietHours(overnight, nowMs);
		expect(result.quiet).toBe(true);
	});
});

describe("classifyHttpFailure", () => {
	it.each([
		[null, "transient"],
		[undefined, "transient"],
		[429, "rate_limited"],
		[404, "invalid_recipient"],
		[410, "invalid_recipient"],
		[500, "transient"],
		[503, "transient"],
		[400, "terminal"],
		[403, "terminal"],
		[422, "terminal"],
		[200, "transient"],
	] as const)("classifies %s as %s", (status, expected) => {
		expect(classifyHttpFailure(status)).toBe(expected);
	});
});

describe("isRetryable", () => {
	it("transient and rate_limited are retryable; invalid_recipient and terminal are not", () => {
		expect(isRetryable("transient")).toBe(true);
		expect(isRetryable("rate_limited")).toBe(true);
		expect(isRetryable("invalid_recipient")).toBe(false);
		expect(isRetryable("terminal")).toBe(false);
	});
});

describe("nextAttemptAtMs", () => {
	const NOW = Date.parse("2026-07-14T15:00:00.000Z");
	const rngHalf = () => 0.5;

	it("attempt 1, transient: jittered = 0.75 * base (30_000ms)", () => {
		const result = nextAttemptAtMs({
			attemptCount: 1,
			failureClass: "transient",
			nowMs: NOW,
			rng: rngHalf,
		});
		expect(result).toBe(NOW + 22_500);
	});

	it("grows exponentially across attempts 1..3 (transient)", () => {
		const at1 = nextAttemptAtMs({ attemptCount: 1, failureClass: "transient", nowMs: NOW, rng: rngHalf });
		const at2 = nextAttemptAtMs({ attemptCount: 2, failureClass: "transient", nowMs: NOW, rng: rngHalf });
		const at3 = nextAttemptAtMs({ attemptCount: 3, failureClass: "transient", nowMs: NOW, rng: rngHalf });
		expect(at1).toBe(NOW + 22_500);
		expect(at2).toBe(NOW + 45_000);
		expect(at3).toBe(NOW + 90_000);
	});

	it("rate_limited attempt 1 uses the longer 300_000ms base", () => {
		const result = nextAttemptAtMs({
			attemptCount: 1,
			failureClass: "rate_limited",
			nowMs: NOW,
			rng: rngHalf,
		});
		expect(result).toBe(NOW + 225_000);
	});

	it("caps the delay at MAX_DELAY_MS (30min) — rate_limited attempt 4 would exceed it uncapped", () => {
		// rate_limited base 300_000 * 2^3 = 2_400_000, capped to 1_800_000.
		// With rng()=1 the jitter formula collapses to exactly `exp`, so the
		// capped value is directly observable.
		const result = nextAttemptAtMs({
			attemptCount: 4,
			failureClass: "rate_limited",
			nowMs: NOW,
			rng: () => 1,
		});
		expect(result).toBe(NOW + 1_800_000);
	});

	it("returns null once attemptCount reaches MAX_DELIVERY_ATTEMPTS", () => {
		expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
		const result = nextAttemptAtMs({
			attemptCount: MAX_DELIVERY_ATTEMPTS,
			failureClass: "transient",
			nowMs: NOW,
			rng: rngHalf,
		});
		expect(result).toBeNull();
	});

	it("returns null for invalid_recipient and terminal regardless of attempt count", () => {
		expect(
			nextAttemptAtMs({ attemptCount: 1, failureClass: "invalid_recipient", nowMs: NOW, rng: rngHalf }),
		).toBeNull();
		expect(
			nextAttemptAtMs({ attemptCount: 1, failureClass: "terminal", nowMs: NOW, rng: rngHalf }),
		).toBeNull();
	});
});

describe("localNow", () => {
	it("resolves the UTC wall clock (Monday 2026-01-05, 14:00) when timezone is null", () => {
		const nowMs = Date.UTC(2026, 0, 5, 14, 0);
		const local = localNow(null, nowMs);
		expect(local).toEqual({ ymd: "2026-01-05", isoDow: 1, hour: 14 });
	});

	it("falls back to UTC for an invalid IANA timezone", () => {
		const nowMs = Date.UTC(2026, 0, 5, 14, 0);
		const local = localNow("Not/AZone", nowMs);
		expect(local).toEqual({ ymd: "2026-01-05", isoDow: 1, hour: 14 });
	});
});

describe("dueWindowKey", () => {
	it("daily: null before 08:00 local", () => {
		const beforeSend = Date.UTC(2026, 0, 5, 7, 59);
		expect(dueWindowKey("daily", "UTC", beforeSend)).toBeNull();
	});

	it("daily: keyed by local date from 08:00 local onward", () => {
		const atSend = Date.UTC(2026, 0, 5, 8, 0);
		expect(dueWindowKey("daily", "UTC", atSend)).toBe("2026-01-05");
	});

	it("weekly: keyed by the Monday date at/after 08:00 local on Monday", () => {
		const mondayAtSend = Date.UTC(2026, 0, 5, 9, 0); // 2026-01-05 is a Monday
		expect(dueWindowKey("weekly", "UTC", mondayAtSend)).toBe("2026-01-05");
	});

	it("weekly: null on a non-Monday even after 08:00 local", () => {
		const tuesdayAtSend = Date.UTC(2026, 0, 6, 9, 0);
		expect(dueWindowKey("weekly", "UTC", tuesdayAtSend)).toBeNull();
	});

	it("falls back to UTC behavior for an invalid timezone", () => {
		const atSend = Date.UTC(2026, 0, 5, 8, 0);
		expect(dueWindowKey("daily", "Not/AZone", atSend)).toBe("2026-01-05");
	});
});
