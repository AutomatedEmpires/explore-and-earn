import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";

/**
 * Server-side Sentry helpers.
 *
 * SERVER-ONLY: this module imports `@clerk/nextjs/server`; never import it from
 * a Client Component. Error boundaries (`error.tsx`) call
 * `Sentry.captureException` directly instead.
 */

/**
 * Business-logic error codes that server actions intentionally return to the
 * caller. These are EXPECTED control-flow outcomes (validation, auth, rate
 * limiting) — never faults — so they must not be reported to Sentry, or they
 * would bury real incidents in noise.
 */
export const EXPECTED_ACTION_ERRORS: ReadonlySet<string> = new Set([
	"already_applied",
	"already_invited",
	"forbidden",
	"rate_limit_exceeded",
	"unauthenticated",
	"not_authenticated",
	"no_token",
	"profile_not_found",
	"name_required",
	"create_failed",
	"update_failed",
	"invalid_photo_url",
	"invalid_length",
	"invalid_status",
	"invalid_travel_readiness",
	"cannot_apply_to_own_listing",
	"unknown_error",
]);

const ENVIRONMENT = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

export interface ReportErrorContext {
	readonly action?: string;
	readonly route?: string;
	readonly userId?: string | null;
	readonly tags?: Record<string, string>;
	readonly extra?: Record<string, unknown>;
}

/** Resolve the current Clerk user id without throwing (null at build time or when signed out). */
async function resolveUserId(): Promise<string | null> {
	try {
		const { userId } = await auth();
		return userId ?? null;
	} catch {
		return null;
	}
}

/**
 * Central server-side error reporter. Wraps `Sentry.captureException`,
 * attaching the Clerk user id (best-effort via `auth()` unless explicitly
 * supplied), the deploy environment, and the app version. Safe to call anywhere
 * on the server: Sentry no-ops when `SENTRY_DSN` is unset (CI / local).
 */
export async function reportError(
	error: unknown,
	context: ReportErrorContext = {},
): Promise<void> {
	const userId =
		context.userId === undefined ? await resolveUserId() : context.userId;

	Sentry.captureException(error, {
		tags: {
			environment: ENVIRONMENT,
			app_version: APP_VERSION,
			...(context.action ? { action: context.action } : {}),
			...(context.route ? { route: context.route } : {}),
			...context.tags,
		},
		extra: { ...context.extra },
		user: userId ? { id: userId } : undefined,
	});
}

function isFailedResult(
	value: unknown,
): value is { ok: false; error?: unknown } {
	return (
		typeof value === "object" &&
		value !== null &&
		"ok" in value &&
		(value as { ok: unknown }).ok === false
	);
}

/** True when an `{ ok:false, error }` code is an unexpected fault worth reporting. */
function isUnexpectedActionError(code: unknown): code is string {
	if (typeof code !== "string" || code.length === 0) return false;
	// Human-readable sentences (containing spaces) are user-facing copy → expected.
	if (code.includes(" ")) return false;
	return !EXPECTED_ACTION_ERRORS.has(code);
}

/**
 * Wrap a server-action body with Sentry instrumentation:
 *
 *  - runs the body inside a named transaction span (`op: "server.action"`,
 *    `name: <actionName>`) so per-action throughput and P95 latency are visible
 *    in Sentry tracing and alertable via the `transaction` / `action` tag;
 *  - reports THROWN (unexpected) errors via `reportError`, then rethrows so
 *    Next.js error handling is unchanged;
 *  - inspects `{ ok:false, error }` results and reports only NON-expected error
 *    codes (codes in EXPECTED_ACTION_ERRORS and human-readable messages are
 *    treated as expected and ignored).
 *
 * Metrics note: the Sentry "metrics" beta (`Sentry.metrics.increment`) was
 * removed in `@sentry/nextjs` v9+ (this app is on v10). Per-action error rate is
 * therefore derived from the span + `action` / `action_error` tags, which is the
 * supported path in v10 and drives the dashboards/alerts in
 * docs/runbooks/sentry-alerts.md.
 */
export async function runAction<T>(
	actionName: string,
	fn: () => Promise<T>,
): Promise<T> {
	return Sentry.startSpan(
		{ name: actionName, op: "server.action", forceTransaction: true },
		async () => {
			try {
				const result = await fn();
				if (
					isFailedResult(result) &&
					isUnexpectedActionError(result.error)
				) {
					await reportError(new Error(`action_failed:${result.error}`), {
						action: actionName,
						tags: { action_error: String(result.error) },
					});
				}
				return result;
			} catch (error) {
				await reportError(error, { action: actionName });
				throw error;
			}
		},
	);
}
