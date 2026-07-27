/**
 * Product funnel event names.
 *
 * A plain module with no imports so tests, server code and client code can all
 * read the same strings. An event name that exists in two places as a literal
 * drifts; PostHog does not notice, and a funnel silently reports zero.
 *
 * NAMING: snake_case, `<actor>_<object>_<verb-past-tense>`, matching the
 * catalogue in docs/runbooks/posthog-funnels.md.
 *
 * NO PII. Properties on these events describe the FUNNEL, never the person.
 * Grouping is by host_profile_id when it is needed at all; the runbook's rule
 * that no raw email, name or company goes into an event property holds here.
 */

/**
 * Commercial redesign D15 — the pre-billing host funnel.
 *
 * These six answer one question the old funnel could not even ask: of the hosts
 * who decline to pay up front, how many build something, and how many of those
 * come back and activate? Under 083 there was no such host — an account that had
 * not paid could not have a workspace — so every one of these is a new fact.
 */
export const HOST_FUNNEL_EVENTS = {
  /** The plans page was rendered. The denominator for everything below. */
  plansViewed: "host_plans_viewed",
  /** The host chose to build before paying, from the plans page. */
  browseFirstSelected: "host_browse_first_selected",
  /** A host profile was created. Carries the account state it was created in. */
  profileCreated: "host_profile_created",
  /** A host began a listing draft. The "did they actually build" signal. */
  listingDraftStarted: "host_listing_draft_started",
  /** The activation banner in the host shell was clicked through to plans. */
  activationBannerClicked: "host_activation_banner_clicked",
  /** Checkout was started from a plan card. */
  checkoutStarted: "host_checkout_started",
} as const;

export type HostFunnelEventName =
  (typeof HOST_FUNNEL_EVENTS)[keyof typeof HOST_FUNNEL_EVENTS];
