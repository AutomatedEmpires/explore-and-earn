import "server-only"

import type { NotificationIntent } from "@explore-and-earn/contracts"
import {
	getApplicationOfferState,
	adminSchedulingContext,
	getListingLiveState,
	getResumeCompletionByProfileId,
} from "@explore-and-earn/db"

// Send-time staleness re-checks. A reminder computed from real state earlier
// may no longer be true by the time its delivery is claimed (offer accepted,
// listing closed, résumé completed, notification past its useful life) —
// sending it anyway would be a false claim. Stale → cancel, never send.

export type RecheckOutcome =
	| { readonly actionable: true }
	| { readonly actionable: false; readonly reason: string }

export async function recheckIntent(
	intent: Pick<NotificationIntent, "type" | "entity" | "expiresAt"> & {
		readonly values?: NotificationIntent["values"]
	},
	nowMs: number,
): Promise<RecheckOutcome> {
	// Universal: an intent past its own expiry is dead on arrival.
	if (intent.expiresAt) {
		const expiresMs = Date.parse(intent.expiresAt)
		if (Number.isFinite(expiresMs) && expiresMs <= nowMs) {
			return { actionable: false, reason: "intent expired before delivery" }
		}
	}

	switch (intent.type) {
		case "interview_proposed":
		case "interview_alternate_requested":
		case "interview_confirmed": {
			if (intent.entity?.type !== "scheduling_request") {
				return { actionable: false, reason: "interview notification without scheduling entity" }
			}
			const schedule = await adminSchedulingContext(intent.entity.id)
			const expected =
				intent.type === "interview_proposed"
					? "proposed"
					: intent.type === "interview_alternate_requested"
						? "alternate_requested"
						: "selected"
			if (!schedule || schedule.status !== expected) {
				return { actionable: false, reason: "interview state already changed" }
			}
			return { actionable: true }
		}
		case "offer_expiring": {
			if (intent.entity?.type !== "application") {
				return { actionable: false, reason: "offer_expiring without application entity" }
			}
			const state = await getApplicationOfferState(intent.entity.id)
			if (!state || state.status !== "offered") {
				return { actionable: false, reason: "offer no longer open" }
			}
			if (!state.expires_at || Date.parse(state.expires_at) <= nowMs) {
				return { actionable: false, reason: "offer already expired" }
			}
			return { actionable: true }
		}
		case "listing_expiring": {
			if (intent.entity?.type !== "listing") {
				return { actionable: false, reason: "listing_expiring without listing entity" }
			}
			const state = await getListingLiveState(intent.entity.id)
			if (!state || state.status !== "live") {
				return { actionable: false, reason: "listing no longer live" }
			}
			if (!state.expires_at || Date.parse(state.expires_at) <= nowMs) {
				return { actionable: false, reason: "listing already expired" }
			}
			return { actionable: true }
		}
		case "resume_nudge": {
			if (intent.entity?.type !== "seeker_profile") {
				return { actionable: false, reason: "resume_nudge without seeker_profile entity" }
			}
			const status = await getResumeCompletionByProfileId(intent.entity.id)
			if (!status) return { actionable: false, reason: "seeker profile gone" }
			if (status.complete) {
				// The résumé was completed in the meantime — congratulating with a
				// nudge would be false. Cancel silently.
				return { actionable: false, reason: "résumé already complete" }
			}
			return { actionable: true }
		}
		default:
			// Event-anchored types describe something that ALREADY happened —
			// they stay true and need no re-check.
			return { actionable: true }
	}
}
