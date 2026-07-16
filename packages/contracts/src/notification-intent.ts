// Notification intent — the canonical, channel-agnostic contract of the
// Lifecycle & Engagement Notification Engine (founder charter 2026-07-14).
//
// CORE INVARIANT: an intent may be constructed ONLY from a persisted domain
// event (events table row) representing something that actually happened.
// Nothing here carries rendered English copy or raw HTML: intents hold
// translation KEYS plus validated primitive interpolation values, and every
// channel renders in the recipient's locale at delivery time.

import type { NotificationCategory as InAppNotificationCategory } from "./enums"

/* -------------------------------------------------------------- categories */

/**
 * User-facing preference categories. Every notification type maps to exactly
 * one; the settings UI exposes THESE (never raw event names).
 */
export const ENGAGEMENT_CATEGORIES = [
	"applications",
	"offers_invites",
	"messages",
	"matches",
	"listing_lifecycle",
	"account_progress",
] as const
export type EngagementCategory = (typeof ENGAGEMENT_CATEGORIES)[number]

/** Channels the engine can deliver through. */
export const ENGAGEMENT_CHANNELS = ["in_app", "email", "push"] as const
export type EngagementChannel = (typeof ENGAGEMENT_CHANNELS)[number]

/** Delivery cadence per category×channel. */
export const NOTIFICATION_CADENCES = ["immediate", "daily", "weekly", "off"] as const
export type NotificationCadence = (typeof NOTIFICATION_CADENCES)[number]

/* ---------------------------------------------------------------- taxonomy */

/**
 * The closed set of notification types the engine can emit. Every type maps
 * to one category, explicit recipient direction, and locale message keys
 * under `notifications.<type>.*` in messages/<locale>.json.
 */
export const NOTIFICATION_TYPES = [
	// Application lifecycle
	"application_received", // host: someone applied
	"application_viewed", // seeker: host viewed the application
	"application_shortlisted", // seeker
	"application_offered", // seeker
	"application_rejected", // seeker (truthful, gentle copy)
	"application_withdrawn", // host
	// Matching & discovery
	"new_strong_match", // seeker: ranked inventory ≥ threshold
	"saved_search_results", // seeker: summary of new results
	// Invitations & offers
	"invite_received", // seeker
	"offer_received", // seeker
	"offer_expiring", // seeker: REAL expiry on a still-actionable offer
	// Messaging
	"message_received", // counterparty only, thread-collapsed
	// Sourced / host lifecycle
	"sourced_listing_claim_submitted", // admin/founder: a claim was INITIATED and awaits review (never implies approval)
	"listing_claim_approved", // claimant: authority accepted — confirmation may begin
	"listing_claim_rejected", // claimant: claim denied (truthful, no listing change)
	"listing_claim_converted", // claimant: listing converted sourced → verified under their host profile
	"listing_expiring", // host: real expires_at approaching
	// Seeker lifecycle
	"resume_nudge", // seeker: genuinely-incomplete résumé, cooldown-gated
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_TYPE_CATEGORY: Record<NotificationType, EngagementCategory> = {
	application_received: "applications",
	application_viewed: "applications",
	application_shortlisted: "applications",
	application_offered: "offers_invites",
	application_rejected: "applications",
	application_withdrawn: "applications",
	new_strong_match: "matches",
	saved_search_results: "matches",
	invite_received: "offers_invites",
	offer_received: "offers_invites",
	offer_expiring: "offers_invites",
	message_received: "messages",
	sourced_listing_claim_submitted: "listing_lifecycle",
	listing_claim_approved: "listing_lifecycle",
	listing_claim_rejected: "listing_lifecycle",
	listing_claim_converted: "listing_lifecycle",
	listing_expiring: "listing_lifecycle",
	resume_nudge: "account_progress",
}

/**
 * Mapping onto the LEGACY in-app notification-center categories (enums.ts
 * NOTIFICATION_CATEGORY, mirrored by the notifications.category CHECK — the
 * 'matches' and 'messages' buckets are added by migration 065). The engine's
 * in-app channel writes MUST use these values so center grouping/filters and
 * the DB constraint stay coherent.
 */
export const NOTIFICATION_TYPE_INAPP_CATEGORY: Record<NotificationType, InAppNotificationCategory> = {
	application_received: "applications",
	application_viewed: "applications",
	application_shortlisted: "applications",
	application_offered: "offers",
	application_rejected: "applications",
	application_withdrawn: "applications",
	new_strong_match: "matches",
	saved_search_results: "matches",
	invite_received: "invites",
	offer_received: "offers",
	offer_expiring: "offers",
	message_received: "messages",
	sourced_listing_claim_submitted: "verification",
	listing_claim_approved: "verification",
	listing_claim_rejected: "verification",
	listing_claim_converted: "verification",
	listing_expiring: "system",
	resume_nudge: "system",
}

/**
 * Types allowed to override a digest cadence and deliver immediately because
 * deferral would destroy their value (a real, imminent expiration). Explicit
 * product policy — never an arbitrary dispatcher exception.
 */
export const URGENT_NOTIFICATION_TYPES: readonly NotificationType[] = [
	"offer_expiring",
]

/**
 * Types allowed to pierce quiet hours for OUTBOUND channels. Product policy:
 * nothing currently qualifies — quiet hours are honored for every lifecycle
 * type, and in-app rows persist immediately regardless (unread on next open).
 */
export const QUIET_HOURS_EXEMPT_TYPES: readonly NotificationType[] = []

/* ------------------------------------------------------------------ intent */

/** Only primitives may be interpolated into copy — no objects, no HTML. */
export type IntentValues = Readonly<Record<string, string | number>>

/**
 * The canonical notification intent shared by all channels. Constructed by
 * the taxonomy from a persisted event + authoritative server-side reads;
 * persisted on the delivery row as its rendering input.
 */
export interface NotificationIntent {
	/** The persisted domain event this notification derives from. */
	readonly sourceEventId: string
	/** ISO timestamp of the source event. */
	readonly sourceOccurredAt: string
	/** Clerk id of the recipient (resolved server-side, never model/client input). */
	readonly recipientClerkUserId: string
	/** Clerk id of the acting user, when meaningful (never notified about self-action). */
	readonly actorClerkUserId?: string
	readonly category: EngagementCategory
	readonly type: NotificationType
	/** Distinguishes intentionally-different notifications from one event. */
	readonly variant: string
	/** BCP-47 locale for rendering; resolved from recipient prefs/profile. */
	readonly locale: string
	/**
	 * App-relative destination WITHOUT locale prefix (e.g. "/applications").
	 * Channels localize the path (locale-aware, path-prefix-aware) at render.
	 * Must start with "/" — absolute/external URLs are rejected (no open
	 * redirects).
	 */
	readonly destinationPath: string
	/** messages/<locale>.json keys under notifications.* */
	readonly titleKey: string
	readonly bodyKey: string
	/** Validated primitive interpolation values (no HTML, no secrets). */
	readonly values: IntentValues
	/** Entity references for audit + staleness re-checks. */
	readonly entity?: { readonly type: string; readonly id: string }
	/** Intent is worthless after this instant (e.g. offer expiry) — recheck+cancel. */
	readonly expiresAt?: string
	/** Collapse group (e.g. thread id) for burst collapsing. */
	readonly collapseKey?: string
	readonly urgent: boolean
}

/* ------------------------------------------------------------------ dedup */

/**
 * THE logical-delivery idempotency boundary:
 * event × recipient × category × channel × variant.
 */
export function notificationDedupKey(args: {
	readonly eventId: string
	readonly recipientClerkUserId: string
	readonly category: EngagementCategory
	readonly channel: EngagementChannel
	readonly variant: string
}): string {
	return [
		args.eventId,
		args.recipientClerkUserId,
		args.category,
		args.channel,
		args.variant,
	].join("␟")
}

/* ------------------------------------------------------------- preferences */

export interface CategoryChannelPrefs {
	readonly email: NotificationCadence
	readonly push: "immediate" | "off"
	readonly inApp: "on" | "off"
}

/**
 * Sane defaults per category: lifecycle communication stays on; noisier
 * discovery categories digest by default; push defaults OFF everywhere until
 * the user opts in (permission UX law).
 */
export const DEFAULT_CATEGORY_PREFS: Record<EngagementCategory, CategoryChannelPrefs> = {
	applications: { email: "immediate", push: "immediate", inApp: "on" },
	offers_invites: { email: "immediate", push: "immediate", inApp: "on" },
	messages: { email: "immediate", push: "immediate", inApp: "on" },
	matches: { email: "daily", push: "off", inApp: "on" },
	listing_lifecycle: { email: "immediate", push: "immediate", inApp: "on" },
	account_progress: { email: "weekly", push: "off", inApp: "on" },
}

export interface QuietHours {
	readonly enabled: boolean
	/** Minutes since local midnight; overnight ranges (start > end) supported. */
	readonly startMinute: number | null
	readonly endMinute: number | null
	/** IANA timezone; null → quiet hours deterministically inactive. */
	readonly timezone: string | null
}

/** Resolved, effective preferences for one user. */
export interface ResolvedNotificationPrefs {
	readonly emailEnabled: boolean
	readonly pushEnabled: boolean
	readonly inAppEnabled: boolean
	readonly categories: Record<EngagementCategory, CategoryChannelPrefs>
	readonly quietHours: QuietHours
}

/* ------------------------------------------------------------ quiet hours */

/**
 * Pure quiet-hours evaluation in the USER'S timezone (DST-correct via
 * Intl.DateTimeFormat). Returns whether `nowMs` is inside quiet hours and,
 * when it is, the epoch ms of the next quiet-hours END in the user's zone.
 * Deterministic fallback: disabled/missing/invalid timezone → never quiet.
 */
export function evaluateQuietHours(
	quiet: QuietHours,
	nowMs: number,
): { readonly quiet: boolean; readonly resumeAtMs: number | null } {
	if (!quiet.enabled || quiet.startMinute == null || quiet.endMinute == null || !quiet.timezone) {
		return { quiet: false, resumeAtMs: null }
	}
	let localMinute: number
	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: quiet.timezone,
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		}).formatToParts(new Date(nowMs))
		const hour = Number(parts.find((p) => p.type === "hour")?.value)
		const minute = Number(parts.find((p) => p.type === "minute")?.value)
		if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
			return { quiet: false, resumeAtMs: null }
		}
		localMinute = hour * 60 + minute
	} catch {
		// Invalid IANA zone → deterministic: never quiet.
		return { quiet: false, resumeAtMs: null }
	}

	const { startMinute: start, endMinute: end } = quiet
	const inQuiet =
		start === end
			? false // zero-length window is disabled, not always-on
			: start < end
				? localMinute >= start && localMinute < end
				: localMinute >= start || localMinute < end // overnight (e.g. 22:00–07:00)

	if (!inQuiet) return { quiet: false, resumeAtMs: null }

	// Minutes until the local end-of-quiet, robust across DST because it is
	// computed from the LOCAL wall-clock delta (bounded 1..1440).
	const minutesUntilEnd = ((end - localMinute) % 1440 + 1440) % 1440 || 1440
	return { quiet: true, resumeAtMs: nowMs + minutesUntilEnd * 60_000 }
}
