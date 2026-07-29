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

/**
 * Host funnel events — ONE catalogue, defined in ./analytics/events.
 *
 * This module used to declare its own `HOST_FUNNEL_EVENTS` with an entirely
 * different set of keys from the one in ./analytics/events. Both were exported
 * under that name, so `import { HOST_FUNNEL_EVENTS } from "../../lib/analytics"`
 * and `… from "../../lib/analytics/events"` handed back different objects, and
 * a call site that guessed wrong got `undefined` — captured without complaint
 * and reported as a funnel with no traffic.
 *
 * Re-exported rather than moved so that every existing importer of this path
 * keeps working; the definition now has exactly one home.
 */
import type { HostFunnelEventName as HostFunnelEventNameInternal } from "./analytics/events";

export { HOST_FUNNEL_EVENTS, HOST_WORKSPACE_EVENTS } from "./analytics/events";
export type {
  HostFunnelEventName,
  HostWorkspaceEventName,
} from "./analytics/events";

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

/**
 * Seeker discovery events (V2-G).
 *
 * The seeker side had no funnel at all: every question about discovery — do
 * people open cards or only skim them, does Swipe produce saves or only passes,
 * does anyone move the map, does the saved-search flywheel ever start turning —
 * was unanswerable, so the surfaces were being tuned on taste.
 *
 * SAME PII RULE as the two catalogues above, and it matters more here because
 * these events describe a person's choices rather than a page view: properties
 * carry the SURFACE and the listing id, never a seeker id, a name, a location,
 * or anything from a résumé.
 */
export const SEEKER_DISCOVERY_EVENTS = {
  /** A listing card was opened (quick peek or detail). Carries `{ surface }`. */
  listingCardOpened: "listing_card_opened",
  /** A listing was saved. Carries `{ surface }`. */
  listingSaved: "listing_saved",
  /**
   * A listing was skipped/passed. Deliberately separate from a save rather than
   * one "decision" event with a direction property: the ratio of the two is the
   * health metric for the deck, and it must be readable without a breakdown.
   */
  listingSkipped: "listing_skipped",
  /** A swipe decision was undone. The measure of whether Undo is doing its job. */
  swipeUndo: "swipe_undo",
  /**
   * The map viewport settled on a new region and the result list re-queried.
   * Carries only a result COUNT and a zoom level — never the bounds, which for
   * a signed-in seeker browsing near home would be location data.
   */
  mapRegionSearched: "map_region_searched",
  /** A search was saved — the start of the return flywheel. */
  savedSearchCreated: "saved_search_created",
} as const;

export type SeekerDiscoveryEvent =
  (typeof SEEKER_DISCOVERY_EVENTS)[keyof typeof SEEKER_DISCOVERY_EVENTS];

export type PublicIaEvent =
  (typeof PUBLIC_IA_EVENTS)[keyof typeof PUBLIC_IA_EVENTS];

/**
 * Kept as an alias of the catalogue's own name so existing importers of
 * `HostFunnelEvent` compile unchanged. It now covers the workspace events too,
 * which is correct: they travel this transport.
 */
export type HostFunnelEvent = HostFunnelEventNameInternal;

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
export type AnalyticsEvent =
  | HostFunnelEvent
  | PublicIaEvent
  | SeekerDiscoveryEvent;

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
