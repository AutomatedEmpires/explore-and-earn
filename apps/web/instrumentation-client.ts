import * as Sentry from "@sentry/nextjs";

// Client-side Sentry initialization (formerly sentry.client.config.ts).
// Sentry.init() silently no-ops when the DSN is undefined.
Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
	tracesSampleRate: 0.05,
	replaysOnErrorSampleRate: 0.1,
	integrations: [Sentry.replayIntegration()],
});

// Instruments App Router navigations for tracing (Next.js 15).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
