// Retry policy for the notification dispatcher: bounded exponential backoff
// with full jitter, plus provider-failure classification. Pure — no I/O, no
// clocks; callers pass `nowMs` and (in tests) a seeded `rng`.

export const MAX_DELIVERY_ATTEMPTS = 5

/** Base delay of the exponential schedule (attempt 1 retry). */
const BASE_DELAY_MS = 30_000
/** Hard ceiling on a single retry delay. */
const MAX_DELAY_MS = 30 * 60_000
/** Rate-limited failures back off harder from the start. */
const RATE_LIMIT_BASE_DELAY_MS = 5 * 60_000

export type FailureClass =
	| "transient" // network/5xx/timeouts — retry with backoff
	| "rate_limited" // 429 — retry with longer backoff
	| "invalid_recipient" // bad address / gone subscription — never retry, suppress target
	| "terminal" // 4xx contract errors — never retry

export function isRetryable(failureClass: FailureClass): boolean {
	return failureClass === "transient" || failureClass === "rate_limited"
}

/**
 * Classify an HTTP-ish provider failure. Unknown shapes default to
 * `transient` (safe: bounded retries then dead-letter, never silent drop).
 */
export function classifyHttpFailure(status: number | null | undefined): FailureClass {
	if (status == null) return "transient" // network error / no response
	if (status === 429) return "rate_limited"
	// Push endpoints signal a dead subscription with 404/410.
	if (status === 404 || status === 410) return "invalid_recipient"
	if (status >= 500) return "transient"
	if (status >= 400) return "terminal"
	return "transient"
}

/**
 * Next-retry timestamp for a delivery that just failed its `attemptCount`-th
 * attempt. Full jitter: uniform in [delay/2, delay] so synchronized failures
 * (provider outage) fan back in spread out. Returns null once the attempt
 * budget is exhausted — the caller must dead-letter, never retry forever.
 */
export function nextAttemptAtMs(args: {
	readonly attemptCount: number
	readonly failureClass: FailureClass
	readonly nowMs: number
	readonly rng?: () => number
}): number | null {
	const { attemptCount, failureClass, nowMs } = args
	if (!isRetryable(failureClass)) return null
	if (attemptCount >= MAX_DELIVERY_ATTEMPTS) return null
	const base = failureClass === "rate_limited" ? RATE_LIMIT_BASE_DELAY_MS : BASE_DELAY_MS
	const exp = Math.min(base * 2 ** Math.max(0, attemptCount - 1), MAX_DELAY_MS)
	const rng = args.rng ?? Math.random
	const jittered = exp / 2 + rng() * (exp / 2)
	return nowMs + Math.round(jittered)
}
