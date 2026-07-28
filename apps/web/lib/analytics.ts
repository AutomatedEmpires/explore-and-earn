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
  /**
   * A specific demo surface was viewed, carrying `{ surface }`.
   *
   * Deliberately separate from host_demo_opened: that event answers "did the
   * demo get opened at all", which is the funnel question, while this one
   * answers "which surfaces did they actually walk", which is the product
   * question. Collapsing them would make the second unanswerable.
   */
  demoSurfaceViewed: "demo_surface_viewed",
  /** A candidate detail view was opened from the demo pipeline. */
  demoCandidateOpened: "demo_candidate_opened",
  /** A candidate was moved between stages in the demo (session-local only). */
  demoStageMoved: "demo_stage_moved",
  /** The seeker-side preview of the demo workspace was opened. */
  demoViewAsSeeker: "demo_view_as_seeker",
  /** The demo was reset to its canonical state. */
  demoReset: "demo_reset",
  /** The anchored product tour was walked to its last stop. */
  demoTourCompleted: "demo_tour_completed",
  /**
   * The pricing area was actually SEEN — scrolled into the viewport, not merely
   * present in a page the visitor left at the hero. That distinction is the
   * whole reason this is a separate event from host_landing_viewed: on a page
   * built to show the product before the price, "did they reach the price" is
   * the question, and a page-view event cannot answer it.
   */
  hostPricingViewed: "host_pricing_viewed",
  /** The activation summary was opened, one step before Stripe. */
  hostActivationPageViewed: "host_activation_page_viewed",
  /** The early-host programme section was scrolled into view. */
  foundingSectionViewed: "founding_section_viewed",
} as const;

/**
 * Public information-architecture events (V2 D18 — the two-door header).
 *
 * These answer questions the host funnel above structurally cannot: the signed-
 * out visitor now chooses a DOOR before they choose an action, and until this
 * release there was no way to see which door was taken, what it led to, or how
 * many people met the Community auth wall on the way.
 *
 * NO PII, same rule as the host funnel: properties describe the DOOR and the
 * DESTINATION, never the person.
 */
export const PUBLIC_IA_EVENTS = {
  /**
   * A role gateway page was viewed. Carries a `role` property so the seeker
   * door and (later) the host door report through one event name rather than
   * two that have to be unioned in every funnel query.
   */
  roleGatewayViewed: "role_gateway_viewed",
  /**
   * A visitor acted on the /for-seekers page. The `cta` property names WHICH
   * action — account creation and "browse without an account" are opposite
   * commitments, and a single click count that merged them would hide the one
   * fact the page exists to reveal.
   */
  forSeekersCtaSelected: "for_seekers_cta_selected",
  /**
   * Community was requested by someone who was not signed in, and the seeker
   * sign-in was shown instead. D18 made Community an authenticated seeker
   * space; this is the measure of what that costs at the door.
   */
  communityAuthRedirected: "community_auth_redirected",
} as const;

export type PublicIaEvent =
  (typeof PUBLIC_IA_EVENTS)[keyof typeof PUBLIC_IA_EVENTS];

export type HostFunnelEvent =
  (typeof HOST_FUNNEL_EVENTS)[keyof typeof HOST_FUNNEL_EVENTS];

/**
 * Every event name this seam will carry.
 *
 * The two catalogues stay SEPARATE constants — a host-funnel call site should
 * not be able to reach for a public-IA name by autocomplete, and the runbook
 * documents them as two funnels — but the transport is one, so the transport's
 * type is the union. Widening happened here rather than by stuffing the new
 * names into HOST_FUNNEL_EVENTS, which would have made "host funnel" a lie the
 * next reader has to discover.
 */
export type AnalyticsEvent = HostFunnelEvent | PublicIaEvent;

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
  name: AnalyticsEvent,
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
