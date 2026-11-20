'use client';

// Browser analytics (PostHog). src/instrumentation-client.ts calls initAnalytics() before the
// app hydrates, so trackClient works anywhere; mount <PostHogProvider> in the root layout only
// to use posthog-js's React hooks.
// Privacy defaults: no autocapture (it records element text), no session recording (legal
// review 4.5; analytics.test.ts and privacy-signals.test.ts keep it off), person profiles only
// for identified users, and every event's own props scrubbed of personal data, message, resume
// and screening-answer text and work-authorization values.
// Consent (SP8 spec 8.4, Plan decision 19): PostHog loads only where the visitor's consent
// allows it. The root layout renders `<meta name="ee-consent" content="<region>:<state>:<viewAs>">`
// (consentMeta in src/app/_features/consent): an EU visitor needs an explicit yes (`granted`);
// elsewhere, anything but a refusal. A page without the tag counts as an EU visitor who has not
// chosen, so nothing loads. Global Privacy Control is a rejection everywhere: when the browser
// sends it, PostHog never loads, so no request reaches it. View-as never loads it.
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

/** The meta tag the root layout renders with the visitor's consent. */
export const CONSENT_META_NAME = 'ee-consent';

export type ConsentMeta = {
  region: 'eu' | 'other';
  state: 'granted' | 'denied' | 'unset';
  viewAs: boolean;
};

const META_VALUE = /^(eu|other):(granted|denied|unset):([01])$/;

/** The meta tag's content, or null when it is missing or malformed. */
export function parseConsentMeta(content: string | null | undefined): ConsentMeta | null {
  const match = META_VALUE.exec(content?.trim() ?? '');
  if (!match) return null;
  return {
    region: match[1] as ConsentMeta['region'],
    state: match[2] as ConsentMeta['state'],
    viewAs: match[3] === '1',
  };
}

/**
 * Whether the page may load analytics: never in view-as; with a granted choice; or outside the
 * EU unless the visitor refused. No meta tag is a no.
 */
export function analyticsAllowedByMeta(meta: ConsentMeta | null): boolean {
  if (!meta || meta.viewAs) return false;
  return meta.state === 'granted' || (meta.region === 'other' && meta.state !== 'denied');
}

function readConsentMeta(): string | null {
  if (typeof document === 'undefined') return null;
  return (
    document.querySelector(`meta[name="${CONSENT_META_NAME}"]`)?.getAttribute('content') ?? null
  );
}

function loadPostHog(key: string): void {
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

/**
 * Starts PostHog once, when NEXT_PUBLIC_POSTHOG_KEY is set, the page's consent allows it and
 * the browser does not send Global Privacy Control. Safe to call repeatedly. Called before the
 * page has finished parsing, it waits for the document so the consent tag can be read.
 */
export function initAnalytics(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined' || posthog.__loaded) return;
  if (browserSendsGpc()) return;
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAnalytics(), { once: true });
    return;
  }
  if (!analyticsAllowedByMeta(parseConsentMeta(readConsentMeta()))) return;
  loadPostHog(key);
}

/**
 * After the visitor accepts analytics (the cookie banner or cookie settings): loads PostHog, or
 * resumes capturing if it was stopped. Never under Global Privacy Control.
 */
export function grantAnalyticsConsent(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined' || browserSendsGpc()) return;
  if (posthog.__loaded) posthog.opt_in_capturing();
  else loadPostHog(key);
}

/** After the visitor refuses analytics: stops capturing and forgets this browser's identity. */
export function revokeAnalyticsConsent(): void {
  if (!posthog.__loaded) return;
  posthog.opt_out_capturing();
  posthog.reset();
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
