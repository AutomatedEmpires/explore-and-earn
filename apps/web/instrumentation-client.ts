import * as Sentry from "@sentry/nextjs";

// Client-side Sentry initialization (formerly sentry.client.config.ts).
// Sentry.init() silently no-ops when the DSN is undefined.
// environment/release mirror the server init (instrumentation.ts) — without
// them Sentry defaults every browser event to environment "production", so
// preview-deploy noise pollutes prod triage and client errors can't be sliced
// by release to verify a rollback (review 2026-07-22). NEXT_PUBLIC_VERCEL_ENV
// is the client-inlined twin of VERCEL_ENV (Vercel system env vars).
Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
	environment:
		process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
	release: process.env.NEXT_PUBLIC_APP_VERSION,
	tracesSampleRate: 0.05,
	replaysOnErrorSampleRate: 0.1,
	// Replay is lazy-loaded: bundling it eagerly shipped ~100 kB to 100% of
	// visitors to cover a 10% on-error sample. lazyLoadIntegration pulls the
	// chunk from Sentry's CDN after init; buffered on-error replays still work.
	integrations: [],
});

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
	void Sentry.lazyLoadIntegration("replayIntegration")
		.then((replayIntegration) => {
			Sentry.addIntegration(replayIntegration());
		})
		.catch(() => {
			// CSP or network blocked the CDN chunk — error monitoring still works.
		});
}

// Instruments App Router navigations for tracing (Next.js 15).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
