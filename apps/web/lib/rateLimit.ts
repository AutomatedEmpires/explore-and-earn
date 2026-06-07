// Simple in-memory rate limiter. Not distributed — replace with Upstash Redis
// when horizontal scaling is needed. Sufficient for MVP single-instance deploy.

interface Window {
	count: number;
	resetAt: number;
}

const store = new Map<string, Window>();

export function checkRateLimit(
	key: string,
	limit: number,
	windowMs: number,
): { allowed: boolean } {
	const now = Date.now();
	const w = store.get(key);
	if (!w || now > w.resetAt) {
		store.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true };
	}
	if (w.count >= limit) return { allowed: false };
	w.count++;
	return { allowed: true };
}
