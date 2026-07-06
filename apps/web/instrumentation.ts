import * as Sentry from "@sentry/nextjs";

const environment =
	process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
const release = process.env.NEXT_PUBLIC_APP_VERSION;

/**
 * Next.js 15 server/edge instrumentation. Sentry.init() runs here: the repo
 * migrated server/edge init out of sentry.server.config.ts / sentry.edge.config.ts
 * (which remain intentional empty stubs to prevent a double Sentry.init()).
 * tracesSampleRate is 0.05 (5%) — low enough for the free tier, still meaningful.
 * Sentry.init() silently no-ops when the DSN is undefined (CI / local).
 */
export function register() {
	// No DSN → skip init entirely instead of relying on Sentry's internal
	// no-op. init() still installs OpenTelemetry request hooks even without a
	// DSN, and under `next dev --turbopack` those hooks (import-in-the-middle)
	// can't be resolved as externals — every request then hangs ~30s and 500s
	// (the audit's "socket hang up" e2e failure). Deployed envs set the DSN,
	// so production observability is unaffected.
	if (!process.env.SENTRY_DSN) {
		return;
	}
	if (process.env.NEXT_RUNTIME === "edge") {
		Sentry.init({
			dsn: process.env.SENTRY_DSN,
			environment,
			release,
			tracesSampleRate: 0.05,
		});
	} else {
		Sentry.init({
			dsn: process.env.SENTRY_DSN,
			environment,
			release,
			tracesSampleRate: 0.05,
		});
	}
}

// Capture errors thrown in nested React Server Components (Next.js 15).
export const onRequestError = Sentry.captureRequestError;
