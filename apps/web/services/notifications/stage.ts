import "server-only"

/**
 * Staged activation for the Lifecycle & Engagement Notification Engine.
 *
 * Before this control existed, the engine had NO activation switch: once
 * migration 065 is applied and RESEND_API_KEY is present, every user gets
 * real email/push immediately, and BEFORE 065 is applied every dispatch pass
 * throws (cron 500s + Sentry noise). Activation must be a founder decision
 * expressed as configuration, not an accident of which env vars exist.
 *
 * The ladder (NOTIFICATION_ENGINE_STAGE):
 *
 *   disabled          — engine fully off. No expansion, no delivery, no
 *                       digests, no reminders; dispatch passes are clean
 *                       no-ops (safe before 065 is applied). THE PRODUCTION
 *                       DEFAULT until the founder sets a stage.
 *   ledger_only       — events expand into delivery rows (full ledger
 *                       fidelity: recheck/consent/collapse all run) but every
 *                       would-send settles 'suppressed' with a stage reason.
 *                       Nothing user-visible anywhere, including in-app.
 *   dry_run           — ledger_only plus a structured would-send log line per
 *                       delivery for operator inspection.
 *   internal_preview  — REAL delivery (all channels) exclusively for the
 *                       Clerk ids in NOTIFICATION_INTERNAL_ALLOWLIST; everyone
 *                       else settles 'suppressed' with the stage reason.
 *   limited           — real delivery for the allowlist plus a deterministic
 *                       NOTIFICATION_LIMITED_PERCENT % of recipients (stable
 *                       per-user cohort via hash, never random per send).
 *   enabled           — full delivery for everyone.
 *
 * Digest windows are only consumed for recipients the stage allows — a gated
 * recipient's memberships stay queued, so raising the stage later delivers
 * digests without losing windows.
 *
 * Defaults: production resolves 'disabled' (fail-closed); non-production
 * resolves 'enabled' so local dev and tests keep exercising the engine
 * (dev email already no-ops without RESEND_API_KEY).
 */

export const NOTIFICATION_ENGINE_STAGES = [
	"disabled",
	"ledger_only",
	"dry_run",
	"internal_preview",
	"limited",
	"enabled",
] as const
export type NotificationEngineStage = (typeof NOTIFICATION_ENGINE_STAGES)[number]

function isStage(value: string): value is NotificationEngineStage {
	return (NOTIFICATION_ENGINE_STAGES as readonly string[]).includes(value)
}

/**
 * Resolve the active stage from the environment. Unset or invalid values
 * fail CLOSED in production ('disabled') and open in dev/test ('enabled').
 */
export function resolveEngineStage(): NotificationEngineStage {
	const raw = process.env.NOTIFICATION_ENGINE_STAGE?.trim().toLowerCase() ?? ""
	if (raw && isStage(raw)) return raw
	const fallback: NotificationEngineStage =
		process.env.NODE_ENV === "production" ? "disabled" : "enabled"
	if (raw) {
		// Misconfiguration is loud, and in production never widens delivery.
		console.error(
			`[notifications] invalid NOTIFICATION_ENGINE_STAGE "${raw}" — falling back to "${fallback}"`,
		)
	}
	return fallback
}

/**
 * Comma-separated Clerk ids allowed real delivery in internal_preview/limited.
 * Memoized on the raw env string: dispatcher/digest loops call the gate once
 * per delivery, and re-splitting per call is pure waste — while keying on the
 * raw value keeps vi.stubEnv-driven tests (and any runtime env change) honest.
 */
let allowlistCache: { raw: string; set: ReadonlySet<string> } | null = null
function internalAllowlist(): ReadonlySet<string> {
	const raw = process.env.NOTIFICATION_INTERNAL_ALLOWLIST ?? ""
	if (allowlistCache?.raw !== raw) {
		allowlistCache = {
			raw,
			set: new Set(
				raw
					.split(",")
					.map((id) => id.trim())
					.filter(Boolean),
			),
		}
	}
	return allowlistCache.set
}

/** Clamped [0,100] rollout percentage for the 'limited' stage (default 0). */
let percentCache: { raw: string; value: number } | null = null
function limitedPercent(): number {
	const raw = process.env.NOTIFICATION_LIMITED_PERCENT ?? ""
	if (percentCache?.raw !== raw) {
		const parsed = Number.parseInt(raw, 10)
		percentCache = {
			raw,
			value: Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0,
		}
	}
	return percentCache.value
}

/**
 * Deterministic per-user bucket in [0,100): the same recipient is always in
 * (or out of) the limited cohort, so a user never flaps between getting and
 * not getting notifications as the dispatcher retries. djb2 — stability
 * matters here, not cryptography.
 */
export function rolloutBucket(recipientClerkUserId: string): number {
	let hash = 5381
	for (let i = 0; i < recipientClerkUserId.length; i += 1) {
		hash = (hash * 33) ^ recipientClerkUserId.charCodeAt(i)
	}
	return Math.abs(hash) % 100
}

export type StageGate =
	| { readonly send: true }
	| { readonly send: false; readonly reason: string }

/**
 * Per-recipient send gate for the resolved stage. Callers settle a gated
 * delivery as 'suppressed' with the returned reason — the ledger records
 * exactly what each stage withheld.
 */
export function stageGateForSend(
	stage: NotificationEngineStage,
	recipientClerkUserId: string,
): StageGate {
	switch (stage) {
		case "enabled":
			return { send: true }
		case "disabled":
			// Dispatch passes no-op before this point; kept as a hard backstop.
			return { send: false, reason: "stage:disabled" }
		case "ledger_only":
			return { send: false, reason: "stage:ledger_only" }
		case "dry_run":
			return { send: false, reason: "stage:dry_run" }
		case "internal_preview":
			return internalAllowlist().has(recipientClerkUserId)
				? { send: true }
				: { send: false, reason: "stage:internal_preview" }
		case "limited": {
			if (internalAllowlist().has(recipientClerkUserId)) return { send: true }
			return rolloutBucket(recipientClerkUserId) < limitedPercent()
				? { send: true }
				: { send: false, reason: "stage:limited" }
		}
	}
}
