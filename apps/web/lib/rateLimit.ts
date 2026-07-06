// Simple in-memory rate limiter. Not distributed — replace with Upstash Redis
// when horizontal scaling is needed. Sufficient for an MVP single-instance
// deploy. Never throws: always returns { allowed: boolean }.

interface RateWindow {
	count: number;
	resetAt: number;
}

const store = new Map<string, RateWindow>();

/**
 * Fixed-window rate limit check.
 *
 * @param key      Unique bucket key, e.g. `apply:${userId}`.
 * @param limit    Max allowed hits within the window.
 * @param windowMs Window length in milliseconds.
 * @returns `{ allowed: true }` while under the limit, `{ allowed: false }` once
 *   the limit is reached for the current window.
 */
/** Lazy eviction: expired windows are only ever replaced on their own next
 * hit, so distinct keys accumulate forever on a long-lived instance. Sweep
 * opportunistically (amortized, bounded). */
let lastSweep = 0;
function sweep(now: number): void {
	if (now - lastSweep < 60_000) return;
	lastSweep = now;
	for (const [key, win] of store) {
		if (now > win.resetAt) store.delete(key);
	}
}

export function checkRateLimit(
	key: string,
	limit: number,
	windowMs: number,
): { allowed: boolean } {
	const now = Date.now();
	sweep(now);
	const existing = store.get(key);

	if (!existing || now > existing.resetAt) {
		store.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true };
	}

	if (existing.count >= limit) {
		return { allowed: false };
	}

	existing.count += 1;
	return { allowed: true };
}
