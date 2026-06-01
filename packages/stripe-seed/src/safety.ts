/**
 * Seed safety guards (DRAFT placeholder). Pure functions, no side effects, no
 * Stripe calls, no secrets. Enforces: test-mode only + live-mode hard stop.
 */

export type SeedMode = "dry-run" | "test-write" | "live-write"

export interface SeedEnv {
	// Provided by the operator's local env at run time. NEVER committed.
	stripeKeyPrefix: string | undefined // e.g. "sk_test_" or "sk_live_"
	requestedMode: SeedMode
	founderApprovalToken: string | undefined // gate P-PROD; absent in this pack
}

export interface SafetyDecision {
	allowed: boolean
	reason: string
}

/**
 * Returns whether a seed run is permitted. In this DRAFT pack, any live-mode
 * request is hard-stopped and any write requires explicit founder approval.
 */
export function evaluateSeedSafety(env: SeedEnv): SafetyDecision {
	const isLiveKey = (env.stripeKeyPrefix ?? "").startsWith("sk_live_")

	// HARD STOP: never operate against a live key in this pack.
	if (isLiveKey || env.requestedMode === "live-write") {
		return {
			allowed: false,
			reason:
				"LIVE MODE HARD STOP: live Stripe keys / live writes are forbidden (gate P-PROD, P-LIVEKEY).",
		}
	}

	if (env.requestedMode === "dry-run") {
		return { allowed: true, reason: "dry-run: no writes performed." }
	}

	// test-write still requires founder approval in this DRAFT pack.
	if (env.requestedMode === "test-write") {
		if (!env.founderApprovalToken) {
			return {
				allowed: false,
				reason:
					"test-write blocked: founder approval token required (gate P-PROD). Use dry-run.",
			}
		}
		return { allowed: true, reason: "test-write approved (test mode only)." }
	}

	return { allowed: false, reason: "unknown mode." }
}
