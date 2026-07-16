import "server-only"

import {
	NOTIFICATION_TYPE_INAPP_CATEGORY,
	type NotificationIntent,
	type NotificationType,
} from "@explore-and-earn/contracts"
import { insertEngineNotification } from "@explore-and-earn/db"

import { isSafeDestinationPath, renderNotification } from "../render"

export interface ChannelSendResult {
	readonly ok: boolean
	/** Logical delivery already existed — success for exactly-once purposes. */
	readonly duplicate?: boolean
	readonly retryable?: boolean
	readonly failureClass?: string
	readonly detail?: string
	readonly providerMessageId?: string
}

/**
 * Legacy in-app dedupe compatibility: strong-match notifications historically
 * used `strong_match:<listingId>:<clerkId>` — the engine writes the SAME key
 * for that type so users alerted by the old cron are never double-notified
 * when the engine takes over.
 */
export function inAppDedupeKey(intent: NotificationIntent, engineDedupKey: string): string {
	if (intent.type === "new_strong_match" && intent.entity?.type === "listing") {
		return `strong_match:${intent.entity.id}:${intent.recipientClerkUserId}`
	}
	return engineDedupKey
}

/**
 * Deliver one intent into the notification center (the notifications table
 * the existing UI reads). Rendered in the recipient's locale; idempotent via
 * dedupe_key.
 */
export async function sendInApp(
	intent: NotificationIntent,
	engineDedupKey: string,
): Promise<ChannelSendResult> {
	const rendered = await renderNotification(intent)
	const actionUrl = isSafeDestinationPath(intent.destinationPath)
		? intent.destinationPath
		: null
	try {
		const result = await insertEngineNotification({
			recipientClerkUserId: intent.recipientClerkUserId,
			inAppCategory:
				NOTIFICATION_TYPE_INAPP_CATEGORY[intent.type as NotificationType] ?? "system",
			priority: intent.urgent ? "important" : "informational",
			title: rendered.title,
			body: rendered.body,
			subjectType: intent.entity?.type,
			subjectId: intent.entity?.id,
			actionUrl: actionUrl ?? undefined,
			dedupeKey: inAppDedupeKey(intent, engineDedupKey),
		})
		return { ok: true, duplicate: result.duplicate }
	} catch (err) {
		return {
			ok: false,
			retryable: true,
			failureClass: "transient",
			detail: err instanceof Error ? err.message : "in_app insert failed",
		}
	}
}
