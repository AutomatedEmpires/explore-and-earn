"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import {
	ENGAGEMENT_CATEGORIES,
	NOTIFICATION_CADENCES,
	type EngagementCategory,
	type NotificationCadence,
	type ResolvedNotificationPrefs,
} from "@explore-and-earn/contracts"
import {
	getEnginePrefs,
	getLegacySeekerEmailBooleans,
	updateNotificationPrefs as updateLegacyPrefsQuery,
	upsertEnginePrefs,
} from "@explore-and-earn/db"

import {
	overlayLegacyEmailBooleans,
	resolvePrefs,
} from "../../services/notifications/prefs"
import { reportError } from "../../lib/sentry"

/**
 * Server actions for the notification-engine preferences (settings surface).
 * All writes are server-validated against the closed contract sets and keyed
 * by the verified auth().userId — a request can never edit another user's
 * preferences. Email-category changes mirror into the legacy 019 booleans so
 * the two preference stores can never disagree about consent.
 */

export interface EngineSettingsView {
	readonly prefs: ResolvedNotificationPrefs
	readonly locale: string | null
	readonly signedIn: boolean
}

async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined
	} catch {
		return undefined
	}
}

/** Effective prefs for the signed-in user (legacy booleans overlaid when no engine row). */
export async function getEngineNotificationSettingsAction(): Promise<EngineSettingsView> {
	try {
		const { userId } = await auth()
		if (!userId) {
			return { prefs: resolvePrefs(null), locale: null, signedIn: false }
		}
		const row = await getEnginePrefs(userId)
		let prefs = resolvePrefs(row)
		if (!row) {
			const legacy = await getLegacySeekerEmailBooleans([userId])
			prefs = overlayLegacyEmailBooleans(prefs, legacy.get(userId) ?? null)
		}
		return { prefs, locale: row?.locale ?? null, signedIn: true }
	} catch (error) {
		reportError(error, {
			action: "getEngineNotificationSettingsAction",
			userId: await currentUserId(),
		})
		return { prefs: resolvePrefs(null), locale: null, signedIn: false }
	}
}

/** Effective prefs materialized as a full category_prefs jsonb map. */
async function effectiveCategoryMap(
	userId: string,
): Promise<Record<string, { email: string; push: string; in_app: string }>> {
	const row = await getEnginePrefs(userId)
	let effective = resolvePrefs(row)
	if (!row) {
		const legacy = await getLegacySeekerEmailBooleans([userId])
		effective = overlayLegacyEmailBooleans(effective, legacy.get(userId) ?? null)
	}
	const map: Record<string, { email: string; push: string; in_app: string }> = {}
	for (const category of ENGAGEMENT_CATEGORIES) {
		const prefs = effective.categories[category]
		map[category] = { email: prefs.email, push: prefs.push, in_app: prefs.inApp }
	}
	return map
}

export interface MasterSwitchPatch {
	readonly emailEnabled?: boolean
	readonly pushEnabled?: boolean
	readonly inAppEnabled?: boolean
}

export async function updateEngineMasterSwitchesAction(
	patch: MasterSwitchPatch,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		const clean: {
			emailEnabled?: boolean
			pushEnabled?: boolean
			inAppEnabled?: boolean
		} = {}
		if (typeof patch.emailEnabled === "boolean") clean.emailEnabled = patch.emailEnabled
		if (typeof patch.pushEnabled === "boolean") clean.pushEnabled = patch.pushEnabled
		if (typeof patch.inAppEnabled === "boolean") clean.inAppEnabled = patch.inAppEnabled
		if (Object.keys(clean).length === 0) return { ok: false, error: "empty_patch" }
		await upsertEnginePrefs(userId, clean)
		revalidatePath("/settings")
		return { ok: true }
	} catch (error) {
		reportError(error, {
			action: "updateEngineMasterSwitchesAction",
			userId: await currentUserId(),
		})
		return { ok: false, error: "failed" }
	}
}

export interface CategoryPrefPatch {
	readonly email?: NotificationCadence
	readonly push?: "immediate" | "off"
	readonly inApp?: "on" | "off"
}

/** Legacy 019 boolean mirrored by each engine category's email preference. */
const LEGACY_MIRROR: Partial<
	Record<EngagementCategory, "emailOnInvite" | "emailOnStatusChange" | "emailOnMessage">
> = {
	offers_invites: "emailOnInvite",
	applications: "emailOnStatusChange",
	messages: "emailOnMessage",
}

export async function updateEngineCategoryPrefAction(
	category: EngagementCategory,
	patch: CategoryPrefPatch,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId, getToken } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		if (!(ENGAGEMENT_CATEGORIES as readonly string[]).includes(category)) {
			return { ok: false, error: "invalid_category" }
		}
		const email =
			patch.email !== undefined &&
			(NOTIFICATION_CADENCES as readonly string[]).includes(patch.email)
				? patch.email
				: undefined
		const push =
			patch.push === "immediate" || patch.push === "off" ? patch.push : undefined
		const inApp = patch.inApp === "on" || patch.inApp === "off" ? patch.inApp : undefined
		if (email === undefined && push === undefined && inApp === undefined) {
			return { ok: false, error: "empty_patch" }
		}

		const map = await effectiveCategoryMap(userId)
		map[category] = {
			email: email ?? map[category].email,
			push: push ?? map[category].push,
			in_app: inApp ?? map[category].in_app,
		}
		await upsertEnginePrefs(userId, { categoryPrefs: map })

		// Mirror into the legacy boolean so the old store never disagrees about
		// consent (best-effort: the seeker row may not exist for hosts).
		const legacyKey = LEGACY_MIRROR[category]
		if (email !== undefined && legacyKey) {
			try {
				const token = await getToken()
				if (token) {
					await updateLegacyPrefsQuery(token, userId, { [legacyKey]: email !== "off" })
				}
			} catch {
				// Host accounts have no seeker prefs row — nothing to mirror.
			}
		}

		revalidatePath("/settings")
		return { ok: true }
	} catch (error) {
		reportError(error, {
			action: "updateEngineCategoryPrefAction",
			userId: await currentUserId(),
		})
		return { ok: false, error: "failed" }
	}
}

export interface QuietHoursPatch {
	readonly enabled: boolean
	readonly startMinute?: number | null
	readonly endMinute?: number | null
	readonly timezone?: string | null
}

function isValidMinute(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1439
}

function isValidTimezone(value: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value })
		return true
	} catch {
		return false
	}
}

export async function updateQuietHoursAction(
	patch: QuietHoursPatch,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		if (patch.enabled) {
			if (!isValidMinute(patch.startMinute) || !isValidMinute(patch.endMinute)) {
				return { ok: false, error: "invalid_window" }
			}
			if (typeof patch.timezone !== "string" || !isValidTimezone(patch.timezone)) {
				return { ok: false, error: "invalid_timezone" }
			}
			await upsertEnginePrefs(userId, {
				quietHoursEnabled: true,
				quietStartMinute: patch.startMinute,
				quietEndMinute: patch.endMinute,
				timezone: patch.timezone,
			})
		} else {
			await upsertEnginePrefs(userId, { quietHoursEnabled: false })
		}
		revalidatePath("/settings")
		return { ok: true }
	} catch (error) {
		reportError(error, {
			action: "updateQuietHoursAction",
			userId: await currentUserId(),
		})
		return { ok: false, error: "failed" }
	}
}
