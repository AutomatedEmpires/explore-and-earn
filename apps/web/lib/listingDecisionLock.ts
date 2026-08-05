import { createHash, randomUUID } from "node:crypto";

interface KvRestConfig {
	readonly url: string;
	readonly token: string;
}

export type ListingDecisionLockFailureReason = "contended" | "unavailable";

export type ListingDecisionLockResult<T> =
	| { readonly acquired: true; readonly value: T }
	| {
			readonly acquired: false;
			readonly reason: ListingDecisionLockFailureReason;
	  };

export interface ListingDecisionLockOptions {
	readonly environment?: string;
	readonly kv?: KvRestConfig | null;
	readonly fetchImpl?: typeof fetch;
	readonly tokenFactory?: () => string;
	readonly sleep?: (delayMs: number) => Promise<void>;
	readonly maxAttempts?: number;
	readonly retryBaseMs?: number;
	readonly lockTtlMs?: number;
	readonly requestTimeoutMs?: number;
}

const localTails = new Map<string, Promise<void>>();

const RELEASE_IF_OWNED_SCRIPT =
	'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

function lockKey(userId: string, listingId: string): string {
	const identityHash = createHash("sha256")
		.update(userId)
		.update("\0")
		.update(listingId)
		.digest("hex");
	return `lock:listing-decision:${identityHash}`;
}

function resolveKvConfig(): KvRestConfig | null {
	const url =
		process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
	const token =
		process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
	if (!url || !token) return null;
	return { url: url.replace(/\/+$/, ""), token };
}

async function runLocallySerialized<T>(
	key: string,
	work: () => Promise<T>,
): Promise<ListingDecisionLockResult<T>> {
	const previous = localTails.get(key) ?? Promise.resolve();
	let releaseTurn: () => void = () => undefined;
	const turn = new Promise<void>((resolve) => {
		releaseTurn = resolve;
	});
	const tail = previous.catch(() => undefined).then(() => turn);
	localTails.set(key, tail);

	await previous.catch(() => undefined);
	try {
		return { acquired: true, value: await work() };
	} finally {
		releaseTurn();
		if (localTails.get(key) === tail) localTails.delete(key);
	}
}

async function postKvCommand(
	config: KvRestConfig,
	command: readonly string[],
	fetchImpl: typeof fetch,
	requestTimeoutMs: number,
): Promise<{ readonly ok: true; readonly result: unknown } | { readonly ok: false }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
	try {
		const response = await fetchImpl(config.url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(command),
			signal: controller.signal,
			cache: "no-store",
		});
		if (!response.ok) return { ok: false };
		const body = (await response.json()) as unknown;
		if (typeof body !== "object" || body === null || !("result" in body)) {
			return { ok: false };
		}
		return {
			ok: true,
			result: (body as { readonly result?: unknown }).result,
		};
	} catch {
		return { ok: false };
	} finally {
		clearTimeout(timeout);
	}
}

async function acquireKvLock(
	config: KvRestConfig,
	key: string,
	token: string,
	options: Required<
		Pick<
			ListingDecisionLockOptions,
			| "fetchImpl"
			| "sleep"
			| "maxAttempts"
			| "retryBaseMs"
			| "lockTtlMs"
			| "requestTimeoutMs"
		>
	>,
): Promise<ListingDecisionLockFailureReason | null> {
	for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
		const response = await postKvCommand(
			config,
			["SET", key, token, "NX", "PX", String(options.lockTtlMs)],
			options.fetchImpl,
			options.requestTimeoutMs,
		);
		if (!response.ok) return "unavailable";
		if (response.result === "OK") return null;
		if (response.result !== null) return "unavailable";
		if (attempt + 1 < options.maxAttempts) {
			const delayMs = Math.min(
				options.retryBaseMs * 2 ** attempt,
				250,
			);
			await options.sleep(delayMs);
		}
	}
	return "contended";
}

async function releaseKvLock(
	config: KvRestConfig,
	key: string,
	token: string,
	fetchImpl: typeof fetch,
	requestTimeoutMs: number,
): Promise<void> {
	await postKvCommand(
		config,
		["EVAL", RELEASE_IF_OWNED_SCRIPT, "1", key, token],
		fetchImpl,
		requestTimeoutMs,
	);
}

/**
 * Serialize one seeker's writes for one listing.
 *
 * Development and tests use an in-process queue. Production deliberately has
 * no local fallback: without a working fleet-wide KV lock, the mutation fails
 * closed instead of racing across serverless instances.
 */
export async function withListingDecisionLock<T>(
	userId: string,
	listingId: string,
	work: () => Promise<T>,
	options: ListingDecisionLockOptions = {},
): Promise<ListingDecisionLockResult<T>> {
	const key = lockKey(userId, listingId);
	const environment = options.environment ?? process.env.NODE_ENV ?? "development";
	if (environment !== "production") {
		return runLocallySerialized(key, work);
	}

	const hasInjectedKv = Object.prototype.hasOwnProperty.call(options, "kv");
	const config = hasInjectedKv ? (options.kv ?? null) : resolveKvConfig();
	if (!config) return { acquired: false, reason: "unavailable" };

	const fetchImpl = options.fetchImpl ?? fetch;
	const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
	const maxAttempts = Math.max(1, Math.min(10, options.maxAttempts ?? 8));
	const retryBaseMs = Math.max(1, options.retryBaseMs ?? 40);
	const lockTtlMs = Math.max(1_000, options.lockTtlMs ?? 30_000);
	const requestTimeoutMs = Math.max(100, options.requestTimeoutMs ?? 1_500);
	const token = (options.tokenFactory ?? randomUUID)();
	const failure = await acquireKvLock(config, key, token, {
		fetchImpl,
		sleep,
		maxAttempts,
		retryBaseMs,
		lockTtlMs,
		requestTimeoutMs,
	});
	if (failure) return { acquired: false, reason: failure };

	try {
		return { acquired: true, value: await work() };
	} finally {
		// Release is an atomic compare-and-delete. A stale owner can never delete
		// a successor's lock if its TTL expired while the work was running.
		await releaseKvLock(config, key, token, fetchImpl, requestTimeoutMs);
	}
}
