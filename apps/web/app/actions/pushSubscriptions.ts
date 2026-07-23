"use server"

import { auth } from "@clerk/nextjs/server"
import {
	deletePushSubscription,
	getEnginePrefs,
	upsertPushSubscription,
} from "@explore-and-earn/db"

import { upsertEnginePrefsSeeded } from "../../services/notifications/prefsWrite"
import { checkRateLimitDistributed } from "../../lib/rateLimit"
import { reportError } from "../../lib/sentry"

/**
 * Web-push subscription lifecycle. Ownership is the verified auth().userId on
 * every call — a subscription can only ever be written or removed for the
 * signed-in user, and subscription keys never leave the server-side store.
 *
 * Permission UX law: these actions are only reachable from the explicit
 * settings toggle — the browser permission prompt is requested client-side on
 * that user gesture, never on page load.
 */

export interface PushSubscribeInput {
	readonly endpoint: string
	readonly keys: { readonly p256dh: string; readonly auth: string }
	readonly userAgent?: string
	readonly timezone?: string
	readonly locale?: string
}

function isValidEndpoint(endpoint: string): boolean {
	if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2048) {
		return false
	}
	try {
		return new URL(endpoint).protocol === "https:"
	} catch {
		return false
	}
}

/** Persist a push subscription for the signed-in user and enable push. */
export async function savePushSubscriptionAction(
	input: PushSubscribeInput,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }

		// Rate limit: 10 subscription saves per hour per user. A browser saves at
		// most a couple per device; without this a scripted caller can persist
		// unbounded rows with distinct endpoints, each becoming dispatch work.
		const { allowed } = await checkRateLimitDistributed(`push-subscription:${userId}`, 10, 60 * 60 * 1000)
		if (!allowed) return { ok: false, error: "rate_limit_exceeded" }

		if (
			!isValidEndpoint(input.endpoint) ||
			typeof input.keys?.p256dh !== "string" ||
			input.keys.p256dh.length === 0 ||
			typeof input.keys?.auth !== "string" ||
			input.keys.auth.length === 0
		) {
			return { ok: false, error: "invalid_subscription" }
		}
		await upsertPushSubscription({
			clerkUserId: userId,
			endpoint: input.endpoint,
			p256dh: input.keys.p256dh,
			auth: input.keys.auth,
			userAgent: input.userAgent?.slice(0, 300) ?? null,
			timezone: input.timezone?.slice(0, 64) ?? null,
			locale: input.locale?.slice(0, 16) ?? null,
		})
		// Subscribing IS the push opt-in: flip the master switch on. Seeded
		// write: creating the user's first prefs row must not discard their
		// legacy email opt-outs.
		await upsertEnginePrefsSeeded(userId, { pushEnabled: true })
		return { ok: true }
	} catch (error) {
		reportError(error, { action: "savePushSubscriptionAction" })
		return { ok: false, error: "failed" }
	}
}

/** Remove one of the signed-in user's push subscriptions (owner-scoped). */
export async function removePushSubscriptionAction(
	endpoint: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		if (!isValidEndpoint(endpoint)) return { ok: false, error: "invalid_endpoint" }
		await deletePushSubscription(userId, endpoint)
		return { ok: true }
	} catch (error) {
		reportError(error, { action: "removePushSubscriptionAction" })
		return { ok: false, error: "failed" }
	}
}

/** Turn the push master switch off (subscriptions are kept but unused). */
export async function disablePushAction(): Promise<{ ok: boolean; error?: string }> {
	try {
		const { userId } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		const existing = await getEnginePrefs(userId)
		if (existing?.push_enabled !== false) {
			await upsertEnginePrefsSeeded(userId, { pushEnabled: false })
		}
		return { ok: true }
	} catch (error) {
		reportError(error, { action: "disablePushAction" })
		return { ok: false, error: "failed" }
	}
}

/**
 * The VAPID PUBLIC key for client-side PushManager.subscribe. Public by
 * definition — the private key never leaves the server env.
 */
export async function getVapidPublicKeyAction(): Promise<{ key: string | null }> {
	return {
		key:
			process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
			process.env.VAPID_PUBLIC_KEY ??
			null,
	}
}
