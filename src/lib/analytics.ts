// Server-side product analytics (PostHog). Events never carry personal data (spec section 13):
// props are scrubbed, and the distinct id is our internal user id, never an email.
// In the browser, use `trackClient` from ./analytics-client instead.
//
// Consent: apiRoute puts the request's verdict in the request context (`analyticsAllowed`),
// and an event is dropped when that says no. Global Privacy Control (`Sec-GPC: 1`) always says
// no, in every region (legal review 4.5). SP8 W5 (#149) also drops events outside a request.
import { PostHog } from 'posthog-node';
import { getRequestContext } from '@/server/request-context';
import { scrubProps } from './analytics-scrub';
import { getEnv } from './env';
import { logger } from './logger';

export { PERSONAL_DATA_KEY, scrubProps } from './analytics-scrub';

/** PostHog Cloud US. Change here (and in the CSP) if the project lives in the EU region. */
export const POSTHOG_HOST = 'https://us.i.posthog.com';

/** The distinct id of server events that belong to no user. */
const ANONYMOUS_ID = 'server';

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client === undefined) {
    const key = getEnv().NEXT_PUBLIC_POSTHOG_KEY;
    // flushAt 1: serverless functions may freeze right after the response, so send at once.
    client = key
      ? new PostHog(key, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0, disableGeoip: true })
      : null;
  }
  return client;
}

/**
 * Records a product event. Fire and forget: never throws, never blocks the caller. A no-op
 * when NEXT_PUBLIC_POSTHOG_KEY is not set, and when the current request does not allow
 * analytics (no consent in the EU, a view-as session, or Global Privacy Control anywhere).
 */
export function track(event: string, props?: Record<string, unknown>, distinctId?: string): void {
  try {
    if (getRequestContext()?.analyticsAllowed === false) return;
    const posthog = getClient();
    if (!posthog) return;
    posthog.capture({
      distinctId: distinctId ?? ANONYMOUS_ID,
      event,
      properties: scrubProps(props ?? {}),
    });
  } catch (err) {
    logger.warn('analytics.track failed', { event, err });
  }
}

/** Sends queued events. Call before a script or worker run exits. */
export async function flushAnalytics(): Promise<void> {
  await client?.flush();
}

/** Forgets the client so the next `track` re-reads the environment. For tests. */
export function resetAnalyticsForTests(): void {
  client = undefined;
}
