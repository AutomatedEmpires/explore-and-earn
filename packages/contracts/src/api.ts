/**
 * Canonical API envelope + error-code union for Explore&Earn v1.
 *
 * Canon: API Contract Registry — V1 Implementation Interfaces (Notion);
 * Backend Architecture, Database & API V1 Build Pack §4.
 *
 * Every `/api/v1/*` route returns `ApiResponse<T>`. Never invent ad-hoc
 * error shapes in feature code — extend the union here (with a canon
 * citation) instead.
 */

/** Closed set of machine-readable error codes returned by the API. */
export type ApiErrorCode =
	| "UNAUTHENTICATED"
	| "FORBIDDEN"
	| "COMPLETION_GATE_NOT_MET"
	| "PLAN_ENTITLEMENT_REQUIRED"
	| "INVITE_CREDITS_REQUIRED"
	| "LISTING_CAPACITY_EXCEEDED"
	| "OBJECT_NOT_ACTIVE"
	| "OBJECT_EXPIRED"
	| "RATE_LIMITED"
	| "MODERATION_RESTRICTED"
	| "BILLING_REQUIRED"
	| "VALIDATION_FAILED"
	| "NOT_FOUND"
	| "CONFLICT"
	| "INTERNAL"

/** A safe-to-surface error payload. Never leak internal detail in `message`. */
export interface ApiError {
	code: ApiErrorCode
	message: string
	/** Optional field-level validation detail, keyed by input path. */
	fields?: Record<string, string>
}

/** Envelope metadata shared by success and error responses. */
export interface ApiResponseMeta {
	/** Server request id for Sentry/PostHog correlation. */
	requestId?: string
	/** Opaque cursor for paginated list endpoints (`null` when no more pages). */
	nextCursor?: string | null
}

/** The single response shape every v1 route returns. */
export type ApiResponse<T> =
	| { ok: true; data: T; meta?: ApiResponseMeta }
	| { ok: false; error: ApiError; meta?: ApiResponseMeta }

/** Actor scope, resolved server-side — never trusted from the client. */
export type RequestScope = "seeker" | "host" | "admin" | "platform"

/** Per-request context assembled by the API layer after authn/authz. */
export interface RequestContext {
	userId: string | null
	scope: RequestScope
	/** Active host team id when `scope === "host"`. */
	teamId?: string | null
	requestId: string
}

/** Narrowing helper for success responses. */
export function isApiOk<T>(
	res: ApiResponse<T>,
): res is { ok: true; data: T; meta?: ApiResponseMeta } {
	return res.ok === true
}
