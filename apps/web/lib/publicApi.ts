import "server-only";

import type { ApiError, ApiResponse } from "@explore-and-earn/contracts";

/**
 * Transport helpers for the public agent API (/api/public/v1/*) — the first
 * real adopters of the canonical ApiResponse<T> envelope (contracts/api.ts).
 * Read-only surface: public caching headers are safe BY CONSTRUCTION because
 * nothing personalized can enter these responses.
 */

export const PUBLIC_LIST_CACHE = "public, s-maxage=60, stale-while-revalidate=300";
export const PUBLIC_DETAIL_CACHE = "public, s-maxage=300, stale-while-revalidate=600";

export function apiOk<T>(
	data: T,
	init?: { cacheControl?: string; nextCursor?: string | null },
): Response {
	const body: ApiResponse<T> = {
		ok: true,
		data,
		...(init?.nextCursor !== undefined ? { meta: { nextCursor: init.nextCursor } } : {}),
	};
	return Response.json(body, {
		headers: {
			"Cache-Control": init?.cacheControl ?? PUBLIC_LIST_CACHE,
			"X-Api-Version": "v1",
		},
	});
}

const STATUS_BY_CODE: Partial<Record<ApiError["code"], number>> = {
	VALIDATION_FAILED: 400,
	UNAUTHENTICATED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	RATE_LIMITED: 429,
	INTERNAL: 500,
};

export function apiError(error: ApiError): Response {
	const body: ApiResponse<never> = { ok: false, error };
	return Response.json(body, {
		status: STATUS_BY_CODE[error.code] ?? 400,
		// Errors are never publicly cached — a transient fault must not stick.
		headers: { "Cache-Control": "no-store", "X-Api-Version": "v1" },
	});
}

/**
 * Best-effort client ip for public rate limiting (x-forwarded-for's first hop
 * on Vercel; 'unknown' groups direct/unattributed callers into one bucket).
 */
export function clientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		const first = forwarded.split(",")[0]?.trim();
		if (first) return first;
	}
	return request.headers.get("x-real-ip") ?? "unknown";
}
