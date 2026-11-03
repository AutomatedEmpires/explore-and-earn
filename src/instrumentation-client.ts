// Runs in the browser before the app becomes interactive: Sentry (when SENTRY_DSN is set at
// build time) and PostHog (when NEXT_PUBLIC_POSTHOG_KEY is set).
import * as Sentry from '@sentry/nextjs';
import '../sentry.client.config';
import { initAnalytics } from '@/lib/analytics-client';

initAnalytics();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
