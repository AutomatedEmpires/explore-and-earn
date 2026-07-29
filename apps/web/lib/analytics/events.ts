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

  /**
   * REDESIGN V2-E — the onboarding funnel, step by step.
   *
   * The six events above answer "did they build anything at all". These answer
   * the question that follows and that nobody could ask before: WHERE a host
   * stops. Onboarding was three screens and one completion signal
   * (profileCreated), so a host who abandoned on the second screen and a host
   * who never opened the first were the same number.
   *
   * Each fires ONCE per step completion, not per render — the wizard holds a
   * per-step guard, because a step that re-reports on every keystroke turns a
   * completion rate into a typing-speed metric.
   */
  /** The onboarding wizard was opened. The denominator for the steps below. */
  onboardingStarted: "host_onboarding_started",
  /** The company identity step was completed and persisted. */
  companyIdentityCompleted: "host_company_identity_completed",
  /** A logo image was uploaded and bound to the host profile. */
  logoUploaded: "host_logo_uploaded",
  /**
   * A cover image was uploaded.
   *
   * The public profile's cover IS the first listing's cover photo
   * (app/[locale]/host/[id]/page.tsx resolves it that way), so this fires from
   * the first-role step rather than from a profile field that does not exist.
   */
  coverUploaded: "host_cover_uploaded",
  /** The employer story step was completed and persisted. */
  storyCompleted: "host_story_completed",
  /** The candidate-experience benefits step was completed and persisted. */
  benefitsCompleted: "host_benefits_completed",
  /** The host opened the seeker-facing preview of their own profile. */
  seekerPreviewOpened: "host_seeker_preview_opened",
} as const;

/**
 * Redesign V2-F1 — the host WORKSPACE loop.
 *
 * The six above end at activation. These four begin where that funnel stops:
 * they measure whether an activated host actually works their season, which is
 * the question renewal turns on and which nothing currently answers.
 *
 * Same no-PII rule, and it bites harder here because every one of these events
 * happens next to a named person. Properties carry ids and shapes — a stage, a
 * count, a listing id — never a candidate's name, location, or match score. A
 * score attached to a person is a judgement about them leaving the product.
 */
export const HOST_WORKSPACE_EVENTS = {
  /** A candidate's detail view was opened. The "did they actually look" signal. */
  candidateReviewed: "host_candidate_reviewed",
  /** A candidate was moved between pipeline stages. Carries `{ to }` only. */
  candidateStageChanged: "host_candidate_stage_changed",
  /** An invite was sent from the outreach surface. */
  inviteSent: "host_invite_sent",
  /** A listing's health/gap detail was expanded. Tells us whether the diagnosis lands. */
  listingHealthViewed: "listing_health_viewed",

  /**
   * REDESIGN V2-F2 — communication and intelligence.
   *
   * F1's four measure whether a host works their PIPELINE. These six measure
   * whether they use the things the pipeline feeds: the inbox, the marketplace
   * announcement, the numbers, the coach, and the plan they are paying for.
   *
   * WHEN THEY FIRE IS PART OF THE DEFINITION. `messageSent` fires only after
   * the server action reports the row persisted — sends are rate-limited (30 a
   * minute) and can be refused, and counting attempts would report a messaging
   * volume the database never saw. `announcementPublished` is separate from
   * `announcementCreated` for the same class of reason: a PURCHASED run is
   * created by the Stripe webhook and published by the host later, sometimes
   * days later, and one name for both would hide the gap between paying and
   * publishing — the number worth knowing.
   *
   * NAMING: `announcement_*`, `analytics_*`, `coach_*` and `plan_*` do not
   * carry the `host_` actor prefix the six above use. That is the founder
   * brief's own list, kept verbatim so the runbook, the dashboards and this
   * file agree; renaming them here to satisfy the convention would silently
   * break every funnel query written against the brief.
   */
  /** A host message was persisted. Post-accept only, never on submit. */
  messageSent: "host_message_sent",
  /** A community announcement row was created. */
  announcementCreated: "announcement_created",
  /** An announcement became publicly visible. */
  announcementPublished: "announcement_published",
  /** An analytics control was changed. Carries `{ filter }`. */
  analyticsFilterUsed: "analytics_filter_used",
  /** A Recruiting Coach recommendation was followed. Carries `{ kind }`. */
  coachRecommendationOpened: "coach_recommendation_opened",
  /** A plan-usage surface was viewed. Carries `{ surface }`. */
  planUsageViewed: "plan_usage_viewed",
} as const;

export type HostWorkspaceEventName =
  (typeof HOST_WORKSPACE_EVENTS)[keyof typeof HOST_WORKSPACE_EVENTS];

export type HostFunnelEventName =
  | (typeof HOST_FUNNEL_EVENTS)[keyof typeof HOST_FUNNEL_EVENTS]
  | HostWorkspaceEventName;
