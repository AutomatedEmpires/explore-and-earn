import * as Sentry from "@sentry/nextjs";

/**
 * Shared Sentry reporting helpers.
 *
 * Client-safe by design: `reportError` / `reportMessage` take `userId` as an
 * argument and import no server-only modules, so they can be called from both
 * server actions and "use client" error boundaries. Sentry no-ops when the DSN
 * is unset (CI / local), so these are always safe to call.
 */

export interface ReportContext {
	readonly action?: string;
	readonly route?: string;
	readonly userId?: string;
}

/** Report an unexpected / thrown error to Sentry with structured context. */
export function reportError(error: unknown, context: ReportContext = {}): void {
	Sentry.captureException(error, {
		tags: { action: context.action, route: context.route },
		user: context.userId ? { id: context.userId } : undefined,
	});
}

/** Report a non-exception message (degraded states, notable events) at a level. */
export function reportMessage(
	message: string,
	level: Sentry.SeverityLevel,
	context: ReportContext = {},
): void {
	Sentry.captureMessage(message, {
		level,
		tags: { action: context.action, route: context.route },
		user: context.userId ? { id: context.userId } : undefined,
	});
}
