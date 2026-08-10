/**
 * Preference resolution + channel planning (services/notifications/prefs.ts).
 *
 * What these pin:
 *  - DEFAULTS: a never-configured user (row === null) gets the documented
 *    defaults — push opt-in OFF, everything else on, quiet hours disabled.
 *  - DEFENSIVE PARSING: category_prefs jsonb is parsed defensively — invalid
 *    cadence/channel values, unknown category keys, and non-object shapes all
 *    fall back to DEFAULT_CATEGORY_PREFS rather than crashing or silently
 *    accepting garbage.
 *  - CHANNEL PLANNING: master switches, per-category cadence, and the urgent
 *    override (offer_expiring must never be buried in a digest) all compose
 *    correctly, and an all-off configuration yields [].
 *  - LEGACY OVERLAY: the 019 email booleans only ever RESTRICT (never
 *    re-enable) and only apply when there is no engine prefs row.
 */
import { describe, expect, it } from "vitest";

import {
	DEFAULT_CATEGORY_PREFS,
	URGENT_NOTIFICATION_TYPES,
	type ResolvedNotificationPrefs,
} from "@explore-and-earn/contracts";

import {
	overlayLegacyEmailBooleans,
	planChannels,
	resolvePrefs,
	type EnginePrefsRow,
} from "../../services/notifications/prefs";

function baseRow(overrides: Partial<EnginePrefsRow> = {}): EnginePrefsRow {
	return {
		email_enabled: true,
		push_enabled: false,
		in_app_enabled: true,
		category_prefs: null,
		quiet_hours_enabled: false,
		quiet_start_minute: null,
		quiet_end_minute: null,
		timezone: null,
		locale: null,
		...overrides,
	};
}

describe("resolvePrefs — never-configured user (row === null)", () => {
	it("returns the documented defaults: push opt-in OFF, everything else on, quiet hours disabled", () => {
		const resolved = resolvePrefs(null);
		expect(resolved.emailEnabled).toBe(true);
		expect(resolved.pushEnabled).toBe(false);
		expect(resolved.inAppEnabled).toBe(true);
		expect(resolved.categories).toEqual(DEFAULT_CATEGORY_PREFS);
		expect(resolved.quietHours).toEqual({
			enabled: false,
			startMinute: null,
			endMinute: null,
			timezone: null,
		});
	});
});

describe("resolvePrefs — category_prefs defensive parsing", () => {
	it("ignores invalid values within a known category and keeps defaults for those keys", () => {
		const row = baseRow({
			category_prefs: {
				applications: { email: "bogus", push: 123, in_app: null },
			},
		});
		const resolved = resolvePrefs(row);
		expect(resolved.categories.applications).toEqual(DEFAULT_CATEGORY_PREFS.applications);
	});

	it("ignores unknown category keys entirely", () => {
		const row = baseRow({
			category_prefs: {
				not_a_real_category: { email: "off", push: "immediate", in_app: "off" },
			},
		});
		const resolved = resolvePrefs(row);
		expect(resolved.categories).toEqual(DEFAULT_CATEGORY_PREFS);
	});

	it("falls back to all defaults when category_prefs is a string", () => {
		const row = baseRow({ category_prefs: "not-an-object" });
		const resolved = resolvePrefs(row);
		expect(resolved.categories).toEqual(DEFAULT_CATEGORY_PREFS);
	});

	it("falls back to all defaults when category_prefs is an array", () => {
		const row = baseRow({ category_prefs: ["applications"] });
		const resolved = resolvePrefs(row);
		expect(resolved.categories).toEqual(DEFAULT_CATEGORY_PREFS);
	});

	it("honors valid overrides for a known category", () => {
		const row = baseRow({
			category_prefs: {
				matches: { email: "off", push: "immediate", in_app: "off" },
			},
		});
		const resolved = resolvePrefs(row);
		expect(resolved.categories.matches).toEqual({
			email: "off",
			push: "immediate",
			inApp: "off",
		});
		// Untouched categories keep their defaults.
		expect(resolved.categories.applications).toEqual(DEFAULT_CATEGORY_PREFS.applications);
	});
});

describe("planChannels", () => {
	function prefsWith(
		overrides: Partial<ResolvedNotificationPrefs> = {},
	): ResolvedNotificationPrefs {
		return {
			emailEnabled: true,
			pushEnabled: true,
			inAppEnabled: true,
			categories: { ...DEFAULT_CATEGORY_PREFS },
			quietHours: { enabled: false, startMinute: null, endMinute: null, timezone: null },
			...overrides,
		};
	}

	it("master emailEnabled=false suppresses the email plan even when the category allows it", () => {
		const prefs = prefsWith({
			emailEnabled: false,
			pushEnabled: false,
			inAppEnabled: false,
			categories: {
				...DEFAULT_CATEGORY_PREFS,
				applications: { email: "immediate", push: "off", inApp: "off" },
			},
		});
		const plans = planChannels({ category: "applications", type: "application_received" }, prefs);
		expect(plans).toEqual([]);
	});

	it("category email 'off' suppresses the email plan even when the master switch is on", () => {
		const prefs = prefsWith({
			pushEnabled: false,
			inAppEnabled: false,
			categories: {
				...DEFAULT_CATEGORY_PREFS,
				applications: { email: "off", push: "off", inApp: "off" },
			},
		});
		const plans = planChannels({ category: "applications", type: "application_received" }, prefs);
		expect(plans).toEqual([]);
	});

	it("a 'daily' cadence produces an email plan with cadence 'daily' for a non-urgent type", () => {
		const prefs = prefsWith({
			pushEnabled: false,
			inAppEnabled: false,
			categories: {
				...DEFAULT_CATEGORY_PREFS,
				matches: { email: "daily", push: "off", inApp: "off" },
			},
		});
		const plans = planChannels({ category: "matches", type: "new_strong_match" }, prefs);
		expect(plans).toEqual([{ channel: "email", cadence: "daily" }]);
	});

	it("push is planned only when pushEnabled AND the category push is 'immediate'", () => {
		const catImmediate = {
			...DEFAULT_CATEGORY_PREFS,
			messages: { email: "off", push: "immediate" as const, inApp: "off" as const },
		};
		const intent = { category: "messages" as const, type: "message_received" as const };

		// Both on → push planned.
		expect(
			planChannels(
				intent,
				prefsWith({ emailEnabled: false, inAppEnabled: false, pushEnabled: true, categories: catImmediate }),
			),
		).toEqual([{ channel: "push", cadence: "immediate" }]);

		// Master off → no push.
		expect(
			planChannels(
				intent,
				prefsWith({ emailEnabled: false, inAppEnabled: false, pushEnabled: false, categories: catImmediate }),
			),
		).toEqual([]);

		// Category push off → no push, even with master on.
		const catOff = {
			...DEFAULT_CATEGORY_PREFS,
			messages: { email: "off", push: "off" as const, inApp: "off" as const },
		};
		expect(
			planChannels(
				intent,
				prefsWith({ emailEnabled: false, inAppEnabled: false, pushEnabled: true, categories: catOff }),
			),
		).toEqual([]);
	});

	it("in_app is planned only when inAppEnabled AND the category inApp is 'on'", () => {
		const catOn = {
			...DEFAULT_CATEGORY_PREFS,
			listing_lifecycle: { email: "off" as const, push: "off" as const, inApp: "on" as const },
		};
		const intent = { category: "listing_lifecycle" as const, type: "listing_expiring" as const };

		expect(
			planChannels(
				intent,
				prefsWith({ emailEnabled: false, pushEnabled: false, inAppEnabled: true, categories: catOn }),
			),
		).toEqual([{ channel: "in_app", cadence: "immediate" }]);

		expect(
			planChannels(
				intent,
				prefsWith({ emailEnabled: false, pushEnabled: false, inAppEnabled: false, categories: catOn }),
			),
		).toEqual([]);
	});

	it("URGENT override: offer_expiring forces email cadence to 'immediate' even when the category is digested", () => {
		const urgentType = URGENT_NOTIFICATION_TYPES[0];
		expect(urgentType).toBe("offer_expiring");
		const prefs = prefsWith({
			pushEnabled: false,
			inAppEnabled: false,
			categories: {
				...DEFAULT_CATEGORY_PREFS,
				offers_invites: { email: "daily", push: "off", inApp: "off" },
			},
		});
		const plans = planChannels({ category: "offers_invites", type: urgentType }, prefs);
		expect(plans).toEqual([{ channel: "email", cadence: "immediate" }]);
	});

	it("keeps invitation email out of digest membership without overriding the chosen cadence", () => {
		const categories = {
			...DEFAULT_CATEGORY_PREFS,
			offers_invites: { email: "weekly" as const, push: "off" as const, inApp: "off" as const },
		};
		const intent = { category: "offers_invites" as const, type: "invite_received" as const };

		expect(
			planChannels(
				intent,
				prefsWith({ pushEnabled: false, inAppEnabled: false, categories }),
			),
		).toEqual([]);
		expect(
			planChannels(
				intent,
				prefsWith({
					pushEnabled: false,
					inAppEnabled: false,
					categories: {
						...categories,
						offers_invites: { ...categories.offers_invites, email: "immediate" },
					},
				}),
			),
		).toEqual([{ channel: "email", cadence: "immediate" }]);
		expect(
			planChannels(
				intent,
				prefsWith({ emailEnabled: false, pushEnabled: false, inAppEnabled: false, categories }),
			),
		).toEqual([]);
	});

	it("returns [] when everything is off", () => {
		const prefs = prefsWith({
			emailEnabled: false,
			pushEnabled: false,
			inAppEnabled: false,
		});
		const plans = planChannels({ category: "applications", type: "application_received" }, prefs);
		expect(plans).toEqual([]);
	});
});

describe("overlayLegacyEmailBooleans", () => {
	it("returns the same object unchanged when legacy is null", () => {
		const resolved = resolvePrefs(null);
		const out = overlayLegacyEmailBooleans(resolved, null);
		expect(out).toBe(resolved);
	});

	it("restricts only the categories whose legacy boolean is false", () => {
		const resolved = resolvePrefs(null);
		const out = overlayLegacyEmailBooleans(resolved, {
			email_on_invite: false,
			email_on_status_change: true,
			email_on_message: true,
		});
		expect(out.categories.offers_invites.email).toBe("off");
		// Untouched: email_on_status_change/email_on_message were true (not
		// disabled), so applications/messages keep their resolved defaults.
		expect(out.categories.applications.email).toBe(DEFAULT_CATEGORY_PREFS.applications.email);
		expect(out.categories.messages.email).toBe(DEFAULT_CATEGORY_PREFS.messages.email);
	});

	it("RESTRICTION-ONLY: an all-true legacy overlay never re-enables an already-off category", () => {
		const resolved = resolvePrefs(null);
		const alreadyOff: ResolvedNotificationPrefs = {
			...resolved,
			categories: {
				...resolved.categories,
				applications: { ...resolved.categories.applications, email: "off" },
			},
		};
		const out = overlayLegacyEmailBooleans(alreadyOff, {
			email_on_invite: true,
			email_on_status_change: true,
			email_on_message: true,
		});
		expect(out.categories).toEqual(alreadyOff.categories);
	});
});
