// Rate limiting — pluggable, with a distributed backend that activates when a
// KV/Redis REST endpoint is configured and otherwise falls back to the original
// in-memory limiter.
//
// WHY: the in-memory Map below is per-instance. On Vercel serverless / edge each
// invocation may hit a fresh instance, so a per-user budget enforced only in
// memory is trivially defeated by fan-out across instances. When the founder
// provisions a KV store (Vercel KV or Upstash Redis — both expose the same
// Upstash REST API), the distributed limiter below enforces the budget
// fleet-wide via an atomic INCR + PEXPIRE fixed window.
//
// NO PROVISIONING happens here. The distributed path is env-gated: it activates
// ONLY when KV_REST_API_URL/KV_REST_API_TOKEN (Vercel KV) or
// UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN (Upstash) are present, and it
// degrades to the in-memory limiter on any error, timeout, or missing config —
// so local/dev and unconfigured deploys keep working exactly as before. To
// activate distributed enforcement, the founder provisions a KV store and sets
// those env vars; no code change is needed.
//
// No dependency is added: the distributed limiter talks to the Upstash REST API
// over plain `fetch`, so it works whether or not @vercel/kv / @upstash/redis is
// installed.

interface RateWindow {
	count: number;
	resetAt: number;
}

const store = new Map<string, RateWindow>();

/**
 * Fixed-window rate limit check (in-memory, per-instance).
 *
 * Retained with its original synchronous signature and behavior so existing
 * callers (e.g. community actions) keep working unchanged. Prefer
 * {@link checkRateLimitDistributed} for new call sites and anything that spends
 * real money / external quota per call.
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

// ── Pluggable limiter ───────────────────────────────────────────────────────

export interface RateLimitResult {
	readonly allowed: boolean;
}

/**
 * A rate limiter backend. Implementations MUST never throw — a limiter failure
 * must not take down the request path; it degrades to allowing (or, for the
 * distributed impl, to the in-memory limiter) instead.
 */
export interface RateLimiter {
	/** Short identifier for logging/diagnostics, e.g. "in-memory" | "kv". */
	readonly name: string;
	limit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

/** In-memory limiter — thin async wrapper over {@link checkRateLimit}. */
class InMemoryRateLimiter implements RateLimiter {
	readonly name = "in-memory";
	limit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
		return Promise.resolve(checkRateLimit(key, limit, windowMs));
	}
}

interface KvRestConfig {
	readonly url: string;
	readonly token: string;
}

/**
 * Resolve the KV/Redis REST endpoint from the standard env pairs. Vercel KV and
 * Upstash Redis expose the identical Upstash REST API; we accept either name.
 * Returns null when unconfigured (→ caller uses the in-memory fallback).
 */
function resolveKvConfig(): KvRestConfig | null {
	const url =
		process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "";
	const token =
		process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
	if (!url || !token) return null;
	return { url: url.replace(/\/+$/, ""), token };
}

/**
 * Distributed fixed-window limiter over the Upstash REST API.
 *
 * Atomicity: a single pipelined request runs `INCR key` then `PEXPIRE key ms NX`
 * — INCR creates/returns the counter, PEXPIRE ... NX stamps the window TTL only
 * on the first hit, so the window is fixed (not sliding). `allowed = count <=
 * limit`.
 *
 * Fail-open to in-memory: any network error, non-OK response, malformed body,
 * or timeout falls back to the per-instance limiter so a KV outage never blocks
 * legitimate traffic (and never throws).
 */
class KvRateLimiter implements RateLimiter {
	readonly name = "kv";
	private readonly config: KvRestConfig;
	private readonly fallback: RateLimiter;

	constructor(config: KvRestConfig, fallback: RateLimiter) {
		this.config = config;
		this.fallback = fallback;
	}

	async limit(
		key: string,
		limit: number,
		windowMs: number,
	): Promise<RateLimitResult> {
		const namespaced = `rl:${key}`;
		const ttlMs = Math.max(1, Math.ceil(windowMs));
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 1500);
		try {
			const res = await fetch(`${this.config.url}/pipeline`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify([
					["INCR", namespaced],
					["PEXPIRE", namespaced, String(ttlMs), "NX"],
				]),
				signal: controller.signal,
				cache: "no-store",
			});
			if (!res.ok) return this.fallback.limit(key, limit, windowMs);

			const body = (await res.json()) as unknown;
			const count = extractPipelineCount(body);
			if (count === null) return this.fallback.limit(key, limit, windowMs);

			return { allowed: count <= limit };
		} catch {
			// Network error / abort / parse failure → per-instance fallback.
			return this.fallback.limit(key, limit, windowMs);
		} finally {
			clearTimeout(timeout);
		}
	}
}

/** Pull the INCR result (first pipeline element) out of an Upstash response. */
function extractPipelineCount(body: unknown): number | null {
	if (!Array.isArray(body) || body.length === 0) return null;
	const first = body[0] as { result?: unknown } | number | null;
	const raw =
		typeof first === "object" && first !== null && "result" in first
			? (first as { result?: unknown }).result
			: first;
	const n = typeof raw === "string" ? Number(raw) : raw;
	return typeof n === "number" && Number.isFinite(n) ? n : null;
}

let cachedLimiter: RateLimiter | null = null;

/**
 * The active limiter: the KV-backed distributed limiter when a REST endpoint is
 * configured, otherwise the in-memory limiter. Memoized per instance.
 */
export function getRateLimiter(): RateLimiter {
	if (cachedLimiter) return cachedLimiter;
	const inMemory = new InMemoryRateLimiter();
	const kv = resolveKvConfig();
	cachedLimiter = kv ? new KvRateLimiter(kv, inMemory) : inMemory;
	return cachedLimiter;
}

/**
 * Distributed-aware rate limit check. Uses the KV backend fleet-wide when
 * configured and transparently falls back to the in-memory limiter otherwise (or
 * on any KV failure). Never throws.
 *
 * Drop-in async replacement for {@link checkRateLimit} at call sites that can
 * `await` — same `{ allowed }` shape.
 */
export function checkRateLimitDistributed(
	key: string,
	limit: number,
	windowMs: number,
): Promise<RateLimitResult> {
	return getRateLimiter().limit(key, limit, windowMs);
}
