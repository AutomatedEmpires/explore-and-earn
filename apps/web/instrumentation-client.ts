import * as Sentry from "@sentry/nextjs";

// Client-side Sentry initialization (formerly sentry.client.config.ts).
// Sentry.init() silently no-ops when the DSN is undefined.
Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
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
