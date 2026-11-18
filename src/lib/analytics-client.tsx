'use client';

// Browser analytics (PostHog). src/instrumentation-client.ts calls initAnalytics() before the
// app hydrates, so trackClient works anywhere; mount <PostHogProvider> in the root layout only
// to use posthog-js's React hooks.
// Privacy defaults: no autocapture (it records element text), no session recording (legal
// review 4.5; analytics.test.ts and privacy-signals.test.ts keep it off), person profiles only
// for identified users, and every event's own props scrubbed of personal data, message, resume
// and screening-answer text and work-authorization values.
// Global Privacy Control is a rejection everywhere: when the browser sends it, PostHog never
// loads, so no request reaches it.
// URLs never carry their query string or fragment, where links put tokens (an invitation lands
// on /sign-up?__clerk_ticket=...): known token parameters are masked at the source, and
// before_send cuts every URL back to origin and path.
import posthog from 'posthog-js';
import { PostHogProvider as BaseProvider } from 'posthog-js/react';
import { useEffect, type ReactNode } from 'react';
import { scrubClientProps, scrubProps, SENSITIVE_URL_PARAMS } from './analytics-scrub';
import { browserSendsGpc } from './privacy-signals';

/** Keep in step with POSTHOG_HOST in ./analytics.ts. */
const POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * Starts PostHog once, when NEXT_PUBLIC_POSTHOG_KEY is set and the browser does not send
 * Global Privacy Control. Safe to call repeatedly.
 */
export function initAnalytics(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined' || posthog.__loaded) return;
  if (browserSendsGpc()) return;
  posthog.init(key, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: 'history_change',
    disable_session_recording: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: SENSITIVE_URL_PARAMS,
    disable_capture_url_hashes: true,
    before_send: (event) => {
      if (browserSendsGpc()) return null;
      if (event?.properties) event.properties = scrubClientProps(event.properties);
      return event;
    },
  });
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(initAnalytics, []);
  return <BaseProvider client={posthog}>{children}</BaseProvider>;
}

/**
 * Records a product event from the browser. A no-op until PostHog is configured and loaded,
 * and under Global Privacy Control.
 */
export function trackClient(event: string, props?: Record<string, unknown>): void {
  if (!posthog.__loaded || browserSendsGpc()) return;
  posthog.capture(event, scrubProps(props ?? {}));
}
