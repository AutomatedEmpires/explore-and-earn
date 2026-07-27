/**
 * Product-analytics event seam (spec D15).
 *
 * PostHog is loaded lazily, at idle, AFTER hydration (app/providers.tsx), so a
 * component that fires an event on mount would otherwise race the SDK and lose
 * the event silently — which is worse than no analytics, because the funnel
 * would look like nobody visited. So this module owns a tiny buffer: events
 * captured before the client registers are held, and flushed in order the
 * moment it does.
 *
 * CONSENT IS NOT THIS MODULE'S JOB, and it must not become it. PostHog is
 * initialised opted-OUT unless the cookie banner recorded consent, and
 * `capture` on an opted-out instance does nothing. The buffer therefore holds
 * event NAMES in memory and nothing leaves the browser until the visitor has
 * agreed — flushing into an opted-out client discards them exactly as an
 * immediate capture would have.
 */

/** The structural slice of the analytics SDK this seam uses. */
export interface AnalyticsClient {
  capture(event: string, properties?: Record<string, unknown>): unknown;
}

/** Host acquisition funnel events. Snake_case, no PII beyond ids PostHog holds. */
export const HOST_FUNNEL_EVENTS = {
  /** The /for-hosts acquisition page was viewed. */
  hostLandingViewed: "host_landing_viewed",
  /** A demo workspace surface was opened. */
  hostDemoOpened: "host_demo_opened",
  /** The product tour was walked to the end on every demo surface. */
  hostDemoTourCompleted: "host_demo_tour_completed",
} as const;

export type HostFunnelEvent =
  (typeof HOST_FUNNEL_EVENTS)[keyof typeof HOST_FUNNEL_EVENTS];

type QueuedEvent = {
  readonly name: string;
  readonly properties?: Record<string, unknown>;
};

let client: AnalyticsClient | null = null;

/**
 * Bounded so a page that never loads the SDK (blocked, offline, no key) cannot
 * grow this array without limit. Twenty is far more than the funnel emits in a
 * single session.
 */
const MAX_QUEUED = 20;
const queued: QueuedEvent[] = [];

/** Called once by the provider after the SDK initialises. Flushes the buffer. */
export function registerAnalyticsClient(instance: AnalyticsClient): void {
  client = instance;
  while (queued.length > 0) {
    const event = queued.shift();
    if (!event) break;
    instance.capture(event.name, event.properties);
  }
}

/** Fire a funnel event. Safe on the server (no-op) and before the SDK loads. */
export function captureEvent(
  name: HostFunnelEvent,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (client) {
    client.capture(name, properties);
    return;
  }
  if (queued.length < MAX_QUEUED) {
    queued.push({ name, properties });
  }
}

/** Test seam — resets the module between assertions. */
export function resetAnalyticsForTest(): void {
  client = null;
  queued.length = 0;
}
