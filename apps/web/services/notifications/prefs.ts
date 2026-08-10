// Pure preference resolution + channel planning. No I/O: the dispatcher
// hands in the stored prefs row (or null for never-configured users) and gets
// back the effective per-channel plan for an intent.

import {
	DEFAULT_CATEGORY_PREFS,
	ENGAGEMENT_CATEGORIES,
	NOTIFICATION_CADENCES,
	URGENT_NOTIFICATION_TYPES,
	type CategoryChannelPrefs,
	type EngagementCategory,
	type EngagementChannel,
	type NotificationCadence,
	type NotificationIntent,
	type ResolvedNotificationPrefs,
} from "@explore-and-earn/contracts"

/** Raw notification_engine_prefs row shape (nullable — row may not exist). */
export interface EnginePrefsRow {
	readonly email_enabled: boolean
	readonly push_enabled: boolean
	readonly in_app_enabled: boolean
	readonly category_prefs: unknown
	readonly quiet_hours_enabled: boolean
	readonly quiet_start_minute: number | null
	readonly quiet_end_minute: number | null
	readonly timezone: string | null
	readonly locale: string | null
}

function isCadence(v: unknown): v is NotificationCadence {
	return typeof v === "string" && (NOTIFICATION_CADENCES as readonly string[]).includes(v)
}

/**
 * Parse the category_prefs jsonb defensively: unknown categories, unknown
 * keys, and invalid cadence values are ignored (defaults win) so a bad write
 * can never crash dispatch or silently invert a preference.
 */
function parseCategoryPrefs(raw: unknown): Record<EngagementCategory, CategoryChannelPrefs> {
	const out = { ...DEFAULT_CATEGORY_PREFS }
	if (typeof raw !== "object" || raw === null) return out
	for (const category of ENGAGEMENT_CATEGORIES) {
		const entry = (raw as Record<string, unknown>)[category]
		if (typeof entry !== "object" || entry === null) continue
		const e = entry as Record<string, unknown>
		const base = out[category]
		out[category] = {
			email: isCadence(e.email) ? e.email : base.email,
			push: e.push === "immediate" || e.push === "off" ? e.push : base.push,
			inApp: e.in_app === "on" || e.in_app === "off" ? e.in_app : base.inApp,
		}
	}
	return out
}

/** Resolve stored prefs (or null) into effective preferences. */
export function resolvePrefs(row: EnginePrefsRow | null): ResolvedNotificationPrefs {
	if (!row) {
		return {
			emailEnabled: true,
			pushEnabled: false,
			inAppEnabled: true,
			categories: { ...DEFAULT_CATEGORY_PREFS },
			quietHours: { enabled: false, startMinute: null, endMinute: null, timezone: null },
		}
	}
	return {
		emailEnabled: row.email_enabled,
		pushEnabled: row.push_enabled,
		inAppEnabled: row.in_app_enabled,
		categories: parseCategoryPrefs(row.category_prefs),
		quietHours: {
			enabled: row.quiet_hours_enabled,
			startMinute: row.quiet_start_minute,
			endMinute: row.quiet_end_minute,
			timezone: row.timezone,
		},
	}
}

/** The 019 seeker email booleans (legacy settings UI). */
export interface LegacyEmailBooleans {
	readonly email_on_invite: boolean
	readonly email_on_status_change: boolean
	readonly email_on_message: boolean
}

/**
 * Consent continuity for users WITHOUT an engine prefs row: an email opt-out
 * made in the legacy settings keeps holding when the engine takes over the
 * corresponding category. Only applied as a RESTRICTION (never re-enables),
 * and never when the user has explicit engine prefs (those already supersede).
 */
export function overlayLegacyEmailBooleans(
	resolved: ResolvedNotificationPrefs,
	legacy: LegacyEmailBooleans | null,
): ResolvedNotificationPrefs {
	if (!legacy) return resolved
	const categories = { ...resolved.categories }
	const off = (category: EngagementCategory, disabled: boolean) => {
		if (disabled) categories[category] = { ...categories[category], email: "off" }
	}
	off("offers_invites", !legacy.email_on_invite)
	off("applications", !legacy.email_on_status_change)
	off("messages", !legacy.email_on_message)
	return { ...resolved, categories }
}

/**
 * One consent authority for both immediate delivery and digest send-time
 * rechecks. A legacy opt-out restricts defaults only while no engine row
 * exists; an explicit engine row supersedes the old settings surface.
 */
export function resolveEffectivePrefs(
	row: EnginePrefsRow | null,
	legacy: LegacyEmailBooleans | null,
): ResolvedNotificationPrefs {
	const resolved = resolvePrefs(row)
	return row ? resolved : overlayLegacyEmailBooleans(resolved, legacy)
}

export interface ChannelPlan {
	readonly channel: EngagementChannel
	/** immediate → a live delivery row; daily/weekly → digest membership. */
	readonly cadence: Extract<NotificationCadence, "immediate" | "daily" | "weekly">
}

/**
 * Plan which channels an intent goes out on, honoring master switches,
 * per-category cadences, and the urgent override. A digest cadence must not
 * bury a REAL imminent expiry. Invitations never override a seeker's chosen
 * cadence, but they also cannot enter the unclaimed digest-member send path:
 * only an explicit immediate email preference creates invitation email.
 * Returns [] when the
 * user has turned everything relevant off; the dispatcher then records the
 * event as processed WITHOUT creating deliveries (suppressed by preference,
 * not lost).
 */
export function planChannels(
	intent: Pick<NotificationIntent, "category" | "type">,
	prefs: ResolvedNotificationPrefs,
): ChannelPlan[] {
	const cat = prefs.categories[intent.category] ?? DEFAULT_CATEGORY_PREFS[intent.category]
	const urgent = (URGENT_NOTIFICATION_TYPES as readonly string[]).includes(intent.type)
	const immediateOnly = intent.type === "invite_received"
	const plans: ChannelPlan[] = []

	if (prefs.inAppEnabled && cat.inApp === "on") {
		plans.push({ channel: "in_app", cadence: "immediate" })
	}
	if (
		prefs.emailEnabled &&
		cat.email !== "off" &&
		(!immediateOnly || cat.email === "immediate")
	) {
		plans.push({
			channel: "email",
			cadence: urgent ? "immediate" : cat.email,
		})
	}
	if (prefs.pushEnabled && cat.push === "immediate") {
		plans.push({ channel: "push", cadence: "immediate" })
	}
	return plans
}
