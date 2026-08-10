import "server-only"

import webpush from "web-push"

import type { NotificationIntent } from "@explore-and-earn/contracts"
import {
	getActivePushSubscriptions,
	recordPushOutcome,
	revokePushSubscription,
} from "@explore-and-earn/db"

import { classifyHttpFailure } from "../backoff"
import { isSafeDestinationPath, localizedPath, renderNotification } from "../render"
import type { BeforeProviderSubmission, ChannelSendResult } from "./inApp"
import { withProviderMutationTimeout } from "./providerBoundary"

/**
 * Web-push channel. VAPID keys come from env (founder-provisioned, same
 * pattern as every other provider credential):
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (mailto: or https:)
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY may mirror the public key for the client.
 *
 * Payloads carry ONLY rendered title/body + a same-app path + collapse tag —
 * never message content beyond the rendered copy, never tokens or ids beyond
 * what the notification click needs. Subscription keys are read server-side
 * and never logged.
 */

let vapidConfigured: boolean | null = null

function ensureVapid(): boolean {
	if (vapidConfigured !== null) return vapidConfigured
	const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
	const privateKey = process.env.VAPID_PRIVATE_KEY
	const subject = process.env.VAPID_SUBJECT ?? "mailto:notifications@exploreandearn.com"
	if (!publicKey || !privateKey) {
		vapidConfigured = false
		return false
	}
	try {
		webpush.setVapidDetails(subject, publicKey, privateKey)
		vapidConfigured = true
	} catch {
		vapidConfigured = false
	}
	return vapidConfigured
}

/** Exposed for tests only — clears the VAPID memoization. */
export function _resetVapidForTests(): void {
	vapidConfigured = null
}

export async function sendPush(
	intent: NotificationIntent,
	beforeProviderSubmission?: BeforeProviderSubmission,
): Promise<ChannelSendResult> {
	if (!ensureVapid()) {
		// Not configured is a terminal condition for this delivery, not an
		// error loop: without keys no retry can ever succeed.
		return {
			ok: false,
			retryable: false,
			failureClass: "terminal",
			detail: "push not configured (VAPID keys absent)",
		}
	}

	const subscriptions = await getActivePushSubscriptions(intent.recipientClerkUserId)
	if (subscriptions.length === 0) {
		// No devices — nothing to deliver to. Terminal, silent, honest.
		return {
			ok: false,
			retryable: false,
			failureClass: "invalid_recipient",
			detail: "no active push subscriptions",
		}
	}

	const rendered = await renderNotification(intent)
	const path = isSafeDestinationPath(intent.destinationPath)
		? localizedPath(rendered.locale, intent.destinationPath)
		: "/"
	const payload = JSON.stringify({
		title: rendered.title,
		body: rendered.body,
		path,
		tag: intent.collapseKey ?? `${intent.type}:${intent.sourceEventId}`,
	})
	const boundary = await beforeProviderSubmission?.()
	if (boundary && !boundary.actionable) {
		return { ok: false, cancelled: boundary.reason }
	}

	let successes = 0
	let anyOutcomeUnknown = false
	let lastFailure: {
		class: string
		detail: string
		retryable: boolean
		outcomeUnknown: boolean
	} | null = null

	try {
		const outcomes = await withProviderMutationTimeout(() =>
			Promise.all(
				subscriptions.map(async (sub) => {
				try {
					await webpush.sendNotification(
						{
							endpoint: sub.endpoint,
							keys: { p256dh: sub.p256dh, auth: sub.auth },
						},
						payload,
						{
							TTL: intent.urgent ? 3600 : 24 * 3600,
							urgency: intent.urgent ? "high" : "normal",
							timeout: 25_000,
						},
					)
					void recordPushOutcome(sub.id, true).catch(() => undefined)
					return { ok: true as const }
				} catch (err) {
					const status =
						typeof (err as { statusCode?: unknown }).statusCode === "number"
							? (err as { statusCode: number }).statusCode
							: null
					const failureClass = classifyHttpFailure(status)
					if (failureClass === "invalid_recipient") {
						// 404/410: the endpoint is gone — revoke so it is never retried.
						void revokePushSubscription(sub.id).catch(() => undefined)
					} else {
						void recordPushOutcome(sub.id, false).catch(() => undefined)
					}
					return {
						ok: false as const,
						class: failureClass,
						// Never log endpoint URLs or keys — status only.
						detail: `push endpoint responded ${status ?? "network-error"}`,
						retryable:
							failureClass === "transient" || failureClass === "rate_limited",
						outcomeUnknown: status === null || failureClass === "transient",
					}
				}
				}),
			),
		)
		for (const outcome of outcomes) {
			if (outcome.ok) {
				successes += 1
				continue
			}
			lastFailure = outcome
			anyOutcomeUnknown ||= outcome.outcomeUnknown
		}
	} catch {
		return {
			ok: false,
			retryable: true,
			outcomeUnknown: true,
			failureClass: "transient",
			detail: "push provider outcome unknown",
		}
	}

	if (successes > 0) return { ok: true }
	return {
		ok: false,
		retryable: lastFailure?.retryable ?? false,
		failureClass: lastFailure?.class ?? "terminal",
		outcomeUnknown: anyOutcomeUnknown,
		detail: lastFailure?.detail ?? "all push sends failed",
	}
}
