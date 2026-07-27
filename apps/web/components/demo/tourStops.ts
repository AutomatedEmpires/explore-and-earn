import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

/**
 * Product-tour content (spec D8).
 *
 * Every stop says three things: what the feature DOES, why it MATTERS, and
 * which plans INCLUDE it. The third one is never typed as a literal — it is
 * derived from PLAN_ENTITLEMENTS, the same contract the server enforces, so a
 * tour stop cannot outlive the entitlement it describes. That is the exact
 * failure mode the team-seat entitlement documents: marketing copy asserting a
 * capability the plan does not grant.
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
  /** The id of the element this stop is about; scrolled to and outlined. */
  readonly targetId?: string;
}

/** Stops per demo surface, keyed by the surface ids in DEMO_SURFACES. */
export const DEMO_TOUR: Readonly<Record<string, readonly TourStop[]>> = {
  overview: [
    {
      id: "overview_workspace",
      title: "This is the workspace, not a brochure",
      body: "Everything on this page is a real product surface fed with sample figures. You can build the same workspace — profile, drafts, previews — before you pay for anything; a plan is what makes a role publishable and discoverable.",
      plans: "Building is free · publishing needs a plan",
      targetId: "tour-overview-head",
    },
    {
      id: "overview_metrics",
      title: "The numbers that tell you to act",
      body: "Views, saves, applications, and time-to-first-application sit together so you can tell a quiet listing from a slow week. A role with views and no saves has a copy problem; one with saves and no applications has a pay or housing problem.",
      plans: plansIncluding(() => true),
      targetId: "tour-overview-metrics",
    },
    {
      id: "overview_allowance",
      title: "What your plan lets you run",
      body: "Active listings, invite credits, and announcement runs are counted against the plan, and the workspace shows the count next to the allowance so you are never surprised at publish time.",
      plans: perPlanCounts("listings", "active listings"),
      targetId: "tour-plan-usage",
    },
  ],
  profile: [
    {
      id: "profile_page",
      title: "One employer profile, every role hangs off it",
      body: "Seekers judge the place before the posting. Your profile carries the season, the crew size, the housing, and the meals once — then every listing you publish inherits that context instead of restating it.",
      plans: plansIncluding(() => true),
      targetId: "tour-profile-cover",
    },
    {
      id: "profile_facts",
      title: "Facts, not adjectives",
      body: "Housing and meals are structured fields with evidence behind them, not a sentence in a paragraph. That is why seekers can filter on them — and why a role that states them outranks one that leaves them blank.",
      plans: plansIncluding(() => true),
      targetId: "tour-profile-facts",
    },
  ],
  job: [
    {
      id: "job_card",
      title: "The card a seeker actually sees",
      body: "This is the same component that renders in Seek, Swipe, and Map — not a mock-up of it. Housing, meals, and pay are on the face of the card, so nobody has to open a listing to find out whether they can afford to take it.",
      plans: plansIncluding(() => true),
      targetId: "tour-job-card",
    },
    {
      id: "job_triad",
      title: "Housing · Meals · Pay decide everything",
      body: "The triad is the product's first law. Stating all three is what makes a role publishable, and a stated benefit is what a seeker filters on when they are choosing between your season and someone else's.",
      plans: plansIncluding(() => true),
      targetId: "tour-job-triad",
    },
    {
      id: "job_match",
      title: "Match scores you can read",
      body: "The score is computed once and stored with the application, so the number on the card is the number in your pipeline. It is availability, benefits, and stated preferences — never a black box, and never sold to raise a listing's rank.",
      plans: plansIncluding(() => true),
      targetId: "tour-job-match",
    },
  ],
  applicants: [
    {
      id: "applicants_pipeline",
      title: "A pipeline, not an inbox",
      body: "New, reviewing, offered. Each applicant carries their match score and the signals behind it, so a season's worth of applications stays a decision instead of a pile of email.",
      plans: plansIncluding(() => true),
      targetId: "tour-pipeline",
    },
    {
      id: "applicants_invites",
      title: "Go and get the seeker you want",
      body: "When nobody has applied yet you are not stuck waiting. Search seekers by availability and benefits needs, and spend an invite credit to put your role in front of one.",
      plans: perPlanCounts("includedInviteCredits", "invites a month"),
      targetId: "tour-invites",
    },
    {
      id: "applicants_messages",
      title: "Messaging in the same place",
      body: "The thread lives beside the application, so the answer to 'is the cabin a private room?' is attached to the person asking it and does not disappear into a personal inbox.",
      plans: plansIncluding(() => true),
      targetId: "tour-threads",
    },
  ],
  announcements: [
    {
      id: "announcements_reach",
      title: "Reach seekers who are not on your listing yet",
      body: "An announcement goes out across the marketplace — a hiring push, a housing update, a deadline. It is how a season opens with a queue instead of a silence.",
      plans: perPlanCounts("monthlyAnnouncements", "runs a month"),
      targetId: "tour-announcements",
    },
    {
      id: "announcements_states",
      title: "Draft, schedule, publish",
      body: "Write it now, send it when it matters. A draft has no engagement figures because it has not run — the workspace shows results only for announcements that actually went out.",
      plans: plansIncluding((entitlement) => entitlement.monthlyAnnouncements > 0),
      targetId: "tour-announce-list",
    },
  ],
  dashboard: [
    {
      id: "dashboard_account",
      title: "Account-wide performance",
      body: "Applications by stage, live listing count, and invite acceptance — the figures that tell you whether the season is on track, on every plan.",
      plans: plansIncluding((entitlement) => entitlement.analytics === "basic" || entitlement.analytics === "full"),
      targetId: "tour-analytics",
    },
    {
      id: "dashboard_per_listing",
      title: "Per-listing diagnosis",
      body: "Which role is pulling and which one is stalling, with applications by stage and invite acceptance for each. This is the paid depth: it turns 'hiring is slow' into 'the kitchen role is slow'.",
      plans: plansIncluding((entitlement) => entitlement.analytics === "full"),
      targetId: "tour-analytics-listings",
    },
  ],
};

/** Total stops across the workspace — pinned by the fixture-integrity test. */
export const DEMO_TOUR_STOP_COUNT = Object.values(DEMO_TOUR).reduce(
  (total, stops) => total + stops.length,
  0,
);
