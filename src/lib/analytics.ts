// Server-side product analytics (PostHog). Events never carry personal data (spec section 13):
// props are scrubbed, and the distinct id is our internal user id, never an email.
// In the browser, use `trackClient` from ./analytics-client instead.
//
// Consent (SP8 Plan decision 19): apiRoute puts the request's verdict in the request context
// (`analyticsAllowed`): the visitor's cookie choice, where an EU visitor needs an explicit yes;
// Global Privacy Control (`Sec-GPC: 1`), a no in every region (legal review 4.5); a view-as
// session, a no; and a signed-in account's recorded opt-out (users.analytics_opt_out_at), a no.
// An event is sent only when that verdict, or the caller's explicit `{ allowed }`, is yes.
// Outside apiRoute (jobs, cron, webhooks, server components, server actions) there is no
// verdict, so an event is dropped unless the caller passes `{ allowed }`; code that knows the
// person calls `trackForUser` from @/modules/privacy, which decides from their consent record.
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

/** Whether the current request allows analytics. False outside a request. */
export function isAnalyticsAllowed(): boolean {
  return getRequestContext()?.analyticsAllowed === true;
}

/**
 * Records a product event. Fire and forget: never throws, never blocks the caller. Sends only
 * when `opts.allowed`, or else the current request's verdict, is true; a request that refuses
 * analytics is never overridden. A no-op when NEXT_PUBLIC_POSTHOG_KEY is not set.
 */
export function track(
  event: string,
  props?: Record<string, unknown>,
  distinctId?: string,
  opts?: { allowed?: boolean },
): void {
  try {
    const verdict = getRequestContext()?.analyticsAllowed;
    if (verdict === false) return;
    if ((opts?.allowed ?? verdict) !== true) return;
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
