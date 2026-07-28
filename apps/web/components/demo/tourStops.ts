import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

/**
 * Anchored product-tour content (spec D19).
 *
 * TWO THINGS CHANGED FROM THE P3 TOUR. First, the tour is now ONE ordered walk
 * across the whole workspace rather than a per-page popup: a host evaluating
 * the product wants a route through it, not a leaflet on every screen. Second,
 * every stop names the element it is about, because a coachmark that points at
 * nothing is just a modal with extra steps.
 *
 * Every stop still says three things: what the feature DOES, why it MATTERS,
 * and which plans INCLUDE it. The third is never typed as a literal — it is
 * derived from PLAN_ENTITLEMENTS, the same contract the server enforces, so a
 * tour stop cannot outlive the entitlement it describes. That is the exact
 * failure mode the colleague-seat entitlement documents: marketing copy
 * asserting a capability the plan does not grant.
 */

type PaidTier = keyof typeof PLAN_ENTITLEMENTS;
type PlanEntitlement = (typeof PLAN_ENTITLEMENTS)[PaidTier];

const TIER_ORDER: readonly PaidTier[] = ["starter", "professional", "enterprise"];

function tierName(tier: PaidTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** "Every plan" / "Professional and Enterprise" / "Enterprise" — never invented. */
export function plansIncluding(
  predicate: (entitlement: PlanEntitlement) => boolean,
): string {
  const names = TIER_ORDER.filter((tier) => predicate(PLAN_ENTITLEMENTS[tier])).map(
    tierName,
  );
  if (names.length === 0) return "Not included on any plan yet";
  if (names.length === TIER_ORDER.length) return "Included on every plan";
  if (names.length === 1) return `Included on ${names[0]}`;
  return `Included on ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Starter 1 · Professional 5 · Enterprise 10" from the contract, per key. */
export function perPlanCounts(
  key: "listings" | "includedInviteCredits" | "monthlyAnnouncements",
  unit: string,
): string {
  return TIER_ORDER.map(
    (tier) => `${tierName(tier)} ${PLAN_ENTITLEMENTS[tier][key]} ${unit}`,
  ).join(" · ");
}

export interface TourStop {
  readonly id: string;
  readonly title: string;
  /** What it does and why it matters, in the host's terms. */
  readonly body: string;
  /** Which plans include it — always derived from PLAN_ENTITLEMENTS. */
  readonly plans: string;
  /** The DEMO_SURFACES id this stop lives on. */
  readonly surfaceId: string;
  /** The route the stop lives on; the tour navigates there if needed. */
  readonly href: string;
  /** The id of the element the coachmark anchors to and outlines. */
  readonly targetId: string;
  /**
   * Dim the rest of the page for this stop.
   *
   * Used SPARINGLY, and never as a way to force attention: a scrim on a stop
   * whose target is one card among many hides the context that makes the card
   * make sense. It is on only where the point of the stop is a single control
   * the eye would otherwise have to hunt for.
   */
  readonly spotlight: boolean;
}

/** The ordered walk. Ten stops, one route through the workspace. */
export const DEMO_TOUR: readonly TourStop[] = [
  {
    id: "tour_profile",
    title: "One employer profile, every role hangs off it",
    body: "Seekers judge the place before the posting. Your profile carries the season, the crew size, the housing, and the meals once — then every role you publish inherits that context instead of restating it.",
    plans: plansIncluding(() => true),
    surfaceId: "profile",
    href: "/for-hosts/demo/profile",
    targetId: "tour-profile-identity",
    spotlight: false,
  },
  {
    id: "tour_listing",
    title: "Seven roles, and the two that are not live say so",
    body: "Five roles are published and taking applications, one closes in under a week, and two are drafts. A draft costs nothing, is not discoverable, and takes no applications — publishing is what a plan buys.",
    plans: perPlanCounts("listings", "active listings"),
    surfaceId: "listings",
    href: "/for-hosts/demo/listings",
    targetId: "tour-listing-inventory",
    spotlight: false,
  },
  {
    id: "tour_seeker_view",
    title: "See exactly what a seeker sees",
    body: "This is your profile and your role rendered by the seeker's own components — the same card that appears in Seek, Swipe and Map. Nothing is redrawn for the preview, so there is no gap between the preview and the real thing.",
    plans: plansIncluding(() => true),
    surfaceId: "seeker",
    href: "/for-hosts/demo/seeker-view",
    targetId: "tour-seeker-preview",
    spotlight: false,
  },
  {
    id: "tour_pipeline",
    title: "A pipeline, not an inbox",
    body: "Ninety-six applications across eight stages, each carrying the match score computed when the application was made. Move a candidate and every number on the page moves with them, because the totals are folds over the applications, not figures stored beside them.",
    plans: plansIncluding(() => true),
    surfaceId: "applicants",
    href: "/for-hosts/demo/applicants",
    targetId: "tour-pipeline",
    spotlight: false,
  },
  {
    id: "tour_outreach",
    title: "Go and get the seeker you want",
    body: "When nobody has applied yet you are not stuck waiting. Search seekers by availability and by the benefits they need, then spend an invite credit to put your role in front of one. Each campaign shows what it returned, so a weak audience is visible rather than expensive.",
    plans: perPlanCounts("includedInviteCredits", "invites a month"),
    surfaceId: "outreach",
    href: "/for-hosts/demo/outreach",
    targetId: "tour-outreach-campaigns",
    spotlight: false,
  },
  {
    id: "tour_messages",
    title: "The answer stays attached to the person who asked",
    body: "Threads live beside the application, with the candidate's stage, availability and housing need in the rail next to them. 'Is the cabin a private room?' is answered once, in the place the decision gets made, instead of disappearing into a personal inbox.",
    plans: plansIncluding(() => true),
    surfaceId: "messages",
    href: "/for-hosts/demo/messages",
    targetId: "tour-message-thread",
    spotlight: false,
  },
  {
    id: "tour_announcements",
    title: "Reach seekers who have not found your listing yet",
    body: "An announcement goes out across the marketplace — a hiring push, a housing update, a closing date. Drafts and scheduled runs carry no engagement figures, because they have not run: numbers appear only against announcements that actually went out.",
    plans: perPlanCounts("monthlyAnnouncements", "runs a month"),
    surfaceId: "announcements",
    href: "/for-hosts/demo/announcements",
    targetId: "tour-announcement-list",
    spotlight: false,
  },
  {
    id: "tour_analytics",
    title: "Numbers that name the role, not the mood",
    body: "Trends, funnel, discovery sources, and a role-by-role comparison with a plain-language diagnosis under each one. This is the paid depth: it turns 'hiring is slow' into 'the kitchen role is slow, and here is the ratio that says so'.",
    plans: plansIncluding((entitlement) => entitlement.analytics === "full"),
    surfaceId: "dashboard",
    href: "/for-hosts/demo/dashboard",
    targetId: "tour-analytics-comparison",
    spotlight: false,
  },
  {
    id: "tour_plan_usage",
    title: "What your plan lets you run, counted before you hit it",
    body: "Active listings, invite credits, and announcement runs are counted against the allowance and shown next to it. You find out you are at the limit here, not at publish time.",
    plans: perPlanCounts("listings", "active listings"),
    surfaceId: "plan",
    href: "/for-hosts/demo/plan",
    targetId: "tour-plan-usage",
    spotlight: true,
  },
  {
    id: "tour_activation",
    title: "Build it all first; pay when you want to publish",
    body: "An account, a profile, branding, drafts and previews cost nothing. A plan is what makes a role publishable and discoverable, and what opens applications, messaging, announcements and real analytics. That is the whole line.",
    plans: "Building is free · publishing needs a plan",
    surfaceId: "plan",
    href: "/for-hosts/demo/plan",
    targetId: "tour-activation",
    spotlight: true,
  },
];

/** Total stops across the workspace — pinned by the fixture-integrity test. */
export const DEMO_TOUR_STOP_COUNT = DEMO_TOUR.length;

/** Stops that live on a given surface, for the per-surface "start here" hint. */
export function tourStopsForSurface(surfaceId: string): readonly TourStop[] {
  return DEMO_TOUR.filter((stop) => stop.surfaceId === surfaceId);
}
