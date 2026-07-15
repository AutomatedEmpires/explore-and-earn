import "server-only"

import {
	ENGAGEMENT_CATEGORIES,
	type EngagementCategory,
} from "@explore-and-earn/contracts"
import {
	getEnginePrefs,
	getLegacySeekerEmailBooleans,
	upsertEnginePrefs,
} from "@explore-and-earn/db"

import { overlayLegacyEmailBooleans, resolvePrefs } from "./prefs"
import type { UnsubscribeScope } from "./unsubscribe"

/**
 * Apply a verified unsubscribe. Idempotent.
 *
 * Consent continuity: when this creates the user's FIRST engine prefs row,
 * the row is seeded from their EFFECTIVE prefs (defaults restricted by the
 * legacy 019 booleans) before the new opt-out is applied — materializing the
 * row can never silently re-subscribe a category the user had turned off.
 */
export async function applyUnsubscribe(
	clerkUserId: string,
	scope: UnsubscribeScope,
): Promise<void> {
	const existing = await getEnginePrefs(clerkUserId)

	if (scope === "all") {
		await upsertEnginePrefs(clerkUserId, { emailEnabled: false })
		return
	}

	// Category-scoped: persist the full effective category map with the one
	// category's email turned off, so defaults + legacy restrictions survive
	// row materialization.
	let effective = resolvePrefs(existing)
	if (!existing) {
		const legacy = await getLegacySeekerEmailBooleans([clerkUserId])
		effective = overlayLegacyEmailBooleans(effective, legacy.get(clerkUserId) ?? null)
	}
	const categoryPrefs: Record<string, unknown> = {}
	for (const category of ENGAGEMENT_CATEGORIES) {
		const prefs = effective.categories[category]
		categoryPrefs[category] = {
			email: category === (scope as EngagementCategory) ? "off" : prefs.email,
			push: prefs.push,
			in_app: prefs.inApp,
		}
	}
	await upsertEnginePrefs(clerkUserId, { categoryPrefs })
}
