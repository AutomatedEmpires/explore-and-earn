import * as Sentry from "@sentry/nextjs";

/**
 * Next.js 15 server/edge instrumentation. Sentry.init() must run inside
 * register() (replaces sentry.server.config.ts / sentry.edge.config.ts).
 * Sentry.init() silently no-ops when the DSN is undefined (e.g. in CI), so
 * this is safe to run in every environment.
 */
export function register() {
	if (process.env.NEXT_RUNTIME === "edge") {
		Sentry.init({
			dsn: process.env.SENTRY_DSN,
		});
	} else {
		Sentry.init({
			dsn: process.env.SENTRY_DSN,
			tracesSampleRate: 0.1,
		});
	}
}

// Capture errors thrown in nested React Server Components (Next.js 15).
export const onRequestError = Sentry.captureRequestError;
