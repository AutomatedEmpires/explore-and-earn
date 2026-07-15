import "server-only"

import { ENGAGEMENT_CATEGORIES } from "@explore-and-earn/contracts"
import {
	getEnginePrefs,
	getLegacySeekerEmailBooleans,
	upsertEnginePrefs,
	type EnginePrefsPatch,
	type EnginePrefsRecord,
} from "@explore-and-earn/db"

import { overlayLegacyEmailBooleans, resolvePrefs } from "./prefs"

/**
 * CONSENT-SAFE writer for notification_engine_prefs — the ONLY correct way
 * to write prefs from the app layer.
 *
 * The hazard it closes: the table's column defaults (email_enabled=true,
 * category_prefs='{}') apply whenever an upsert CREATES the first row for a
 * user. Users without a row are governed by DEFAULTS RESTRICTED BY their
 * legacy 019 email booleans (see resolveRecipients) — so a partial first
 * write (e.g. enabling push, toggling a master switch, setting quiet hours)
 * would silently discard a legacy email opt-out and re-subscribe them.
 *
 * This wrapper seeds the first row from the user's EFFECTIVE preferences
 * (defaults + legacy overlay) before applying the caller's patch, so
 * materializing the row never changes what the user receives.
 */
export async function upsertEnginePrefsSeeded(
	clerkUserId: string,
	patch: EnginePrefsPatch,
): Promise<{ readonly existing: EnginePrefsRecord | null }> {
	const existing = await getEnginePrefs(clerkUserId)
	if (existing) {
		await upsertEnginePrefs(clerkUserId, patch)
		return { existing }
	}

	const legacy = await getLegacySeekerEmailBooleans([clerkUserId])
	const effective = overlayLegacyEmailBooleans(
		resolvePrefs(null),
		legacy.get(clerkUserId) ?? null,
	)
	const categoryPrefs: Record<string, unknown> = {}
	for (const category of ENGAGEMENT_CATEGORIES) {
		const prefs = effective.categories[category]
		categoryPrefs[category] = {
			email: prefs.email,
			push: prefs.push,
			in_app: prefs.inApp,
		}
	}
	await upsertEnginePrefs(clerkUserId, {
		emailEnabled: effective.emailEnabled,
		pushEnabled: effective.pushEnabled,
		inAppEnabled: effective.inAppEnabled,
		categoryPrefs,
		...patch, // the caller's intent wins over the seed
	})
	return { existing: null }
}
