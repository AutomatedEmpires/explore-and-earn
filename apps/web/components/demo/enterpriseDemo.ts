import type { HostAnalytics } from "@explore-and-earn/db";

import type { DiscoveryListing } from "../discovery/listing";

/**
 * Enterprise DEMO workspace — typed FIXTURES (spec D8).
 *
 * Follows components/discovery/fixtures.ts: one module, no backend, everything
 * typed against the frozen contracts. Nothing here is ever written to the
 * database and nothing here describes a real host, a real seeker, or a real
 * result. It exists so a signed-out visitor can walk the Enterprise experience
 * with the REAL product components before they pay for anything.
 *
 * THE LABELLING RULE IS STRUCTURAL, NOT EDITORIAL. Every collection in this
 * module carries a `demoLabel` on EVERY item, and the components render it.
 * That is deliberate: a label that lives in a page's JSX can be dropped by a
 * later edit and nothing notices, whereas a missing label here is a type error
 * and a failing fixture-integrity test. If you add a collection, give its items
 * a demoLabel too.
 *
 * The numbers below are internally consistent (see the fixture-integrity test):
 * the per-listing stage counts sum to the account-wide stage counts, the stage
 * counts sum to the headline application total, the invite counts sum to the
 * headline invite figures, and the discovery-source counts sum to the
 * opportunity-view total. They are plausible, not measured, and are never
 * presented as measured.
 */

// ─── Labels ────────────────────────────────────────────────────────────────

/** Stamped on demo entities (org, job, announcements, applicants, threads). */
export const DEMO_DATA_LABEL = "Demo data";
/** Stamped on demo performance figures (headline metric tiles). */
export const DEMO_PERFORMANCE_LABEL = "Example performance";
/** Stamped on demo analytics breakdowns (sources, funnel, plan usage). */
export const DEMO_ANALYTICS_LABEL = "Sample analytics";

/** Every label a demo surface may render. The integrity test enumerates these. */
export const DEMO_LABELS = [
  DEMO_DATA_LABEL,
  DEMO_PERFORMANCE_LABEL,
  DEMO_ANALYTICS_LABEL,
] as const;

export type DemoLabel = (typeof DEMO_LABELS)[number];

/** The one-line disclosure the persistent demo banner renders. */
export const DEMO_BANNER_TEXT =
  "Demo workspace — sample data. This is the Enterprise experience.";

// ─── The canonical demo organisation ───────────────────────────────────────

export interface DemoOrg {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  /** Display name of the plan whose experience this workspace shows. */
  readonly planName: string;
  /** The stored tier key the plan maps to (drives entitlement lookups). */
  readonly planTier: "starter" | "professional" | "enterprise";
  /** Verified is subscription-derived, never self-declared (contracts/card.ts). */
  readonly verified: boolean;
  readonly tagline: string;
  readonly about: string;
  /**
   * Which lane gradient paints this org's cover. There is NO photography in
   * this module by design (spec D9): the cover is a token gradient and the
   * "logo" is the in-repo brand mark, so a real photo can drop into the same
   * slot later without a layout change.
   */
  readonly lane: DiscoveryListing["category"];
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly demoLabel: DemoLabel;
}

export const DEMO_ORG: DemoOrg = {
  id: "demo_org_explore_and_earn",
  name: "Explore & Earn",
  location: "Coeur d'Alene, Idaho",
  planName: "Enterprise",
  planTier: "enterprise",
  verified: true,
  tagline:
    "Lakeside guest operations on the Idaho panhandle — staff housing, shared meals, and a season worth staying for.",
  about:
    "A lakeside guest operation running boat tours, trail programs, and an on-site kitchen from spring thaw to first snow. Crew live on the property in staff cabins, eat together, and finish the season with a bonus and a reference.",
  lane: "seasonal",
  facts: [
    { label: "Season", value: "May – September" },
    { label: "Crew size", value: "About 24 seasonal roles" },
    { label: "Housing", value: "On-site staff cabins" },
    { label: "Meals", value: "Two crew meals a day" },
  ],
  demoLabel: DEMO_DATA_LABEL,
};

// ─── The demo job (spec D8) ────────────────────────────────────────────────

/**
 * The demo opportunity, typed as a real DiscoveryListing so the REAL
 * DiscoveryCard renders it — same component, same triad, same badges the seeker
 * sees. No cover image: the card's no-cover path paints the lane watermark,
 * which is also what a host's listing looks like before they upload, so the
 * preview is honest about the starting state.
 */
export const DEMO_LISTING: DiscoveryListing = {
  id: "demo_lst_lakeside_guest_experience",
  title: "Lakeside Guest Experience & Adventure Operations",
  category: "seasonal",
  location: "Coeur d'Alene, Idaho",
  coordinates: { lat: 47.6777, lon: -116.7805 },
  opportunityWindow: "May–Sep 2026",
  begins: "May 4, 2026",
  ends: "Sep 20, 2026",
  status: "live",
  host: {
    id: DEMO_ORG.id,
    name: DEMO_ORG.name,
    verified: true,
    tier: "enterprise",
    tagline: DEMO_ORG.tagline,
  },
  benefits: {
    housing: { provision: "provided", summary: "Private room in staff cabin" },
    meals: { provision: "provided", summary: "Two crew meals daily" },
    pay: { provision: "provided", summary: "$21–25/hr" },
  },
  conditionalBadges: ["boosted"],
  matchScore: 91,
  visaSupport: false,
  payInsight: {
    meterValue: 79,
    minCents: 2100,
    maxCents: 2500,
    unit: "hour",
    note: "Housing and two meals a day sit on top of the hourly rate.",
  },
};

export interface DemoJobDetail {
  readonly listingId: string;
  readonly employmentType: string;
  readonly hoursPerWeek: string;
  readonly experience: string;
  readonly applyMinutes: number;
  readonly summary: string;
  readonly responsibilities: readonly string[];
  readonly included: readonly { readonly title: string; readonly detail: string }[];
  readonly demoLabel: DemoLabel;
}

export const DEMO_JOB: DemoJobDetail = {
  listingId: DEMO_LISTING.id,
  employmentType: "Full-time seasonal",
  hoursPerWeek: "About 40 hours a week",
  experience: "Entry level welcome — we train on the water and on the trail",
  applyMinutes: 4,
  summary:
    "Run the guest side of a lakeside season: morning boat departures, afternoon trail programs, and the evening turn. You live on site, eat with the crew, and finish the season with a completion bonus.",
  responsibilities: [
    "Greet arriving guests and run the morning departure board",
    "Crew boat tours and shoreline paddle trips",
    "Lead afternoon trail and dock programs",
    "Keep gear, radios, and safety kit checked and logged",
    "Close the day with the guest team and hand over to the evening shift",
  ],
  included: [
    {
      title: "Housing included",
      detail: "Private room in an on-site staff cabin, linens and utilities covered.",
    },
    {
      title: "Meals included",
      detail: "Two crew meals a day through the whole season, seven days a week.",
    },
    {
      title: "Season-completion bonus",
      detail: "Paid at the end of the season to crew who finish their contract.",
    },
    {
      title: "Staff activities",
      detail: "Crew paddle nights, trail runs, and an end-of-season gathering.",
    },
    {
      title: "Gear access",
      detail: "Boats, boards, and trail gear are yours to use on days off.",
    },
  ],
  demoLabel: DEMO_DATA_LABEL,
};

// ─── Analytics (feeds the REAL HostAnalyticsDashboard) ─────────────────────

/**
 * Shaped exactly as getHostAnalytics would return it for an Enterprise host, so
 * components/host/HostAnalyticsDashboard renders it with no demo-specific
 * branch. `analyticsScope: "full"` because the Enterprise plan's analytics
 * entitlement is "full" — the demo shows the plan's real depth, not a made-up
 * one.
 */
export const DEMO_ANALYTICS: HostAnalytics = {
  totalApplicationsByStatus: {
    applied: 38,
    reviewing: 21,
    saved_by_host: 9,
    offered: 12,
    accepted: 7,
    declined: 3,
    withdrawn: 2,
    not_selected: 4,
  },
  activeListingCount: 3,
  listingCount: 5,
  inviteAcceptanceRate: 19 / 34,
  analyticsScope: "full",
  perListingStats: [
    {
      listingId: DEMO_LISTING.id,
      listingTitle: DEMO_LISTING.title,
      listingStatus: "live",
      applicationsByStatus: {
        applied: 20,
        reviewing: 12,
        saved_by_host: 5,
        offered: 7,
        accepted: 4,
        declined: 2,
        withdrawn: 1,
        not_selected: 1,
      },
      totalApplications: 52,
      invitesSent: 18,
      invitesAccepted: 11,
    },
    {
      listingId: "demo_lst_trail_dock_crew",
      listingTitle: "Trail & Dock Maintenance Crew",
      listingStatus: "live",
      applicationsByStatus: {
        applied: 11,
        reviewing: 6,
        saved_by_host: 3,
        offered: 3,
        accepted: 2,
        declined: 1,
        withdrawn: 1,
        not_selected: 0,
      },
      totalApplications: 27,
      invitesSent: 10,
      invitesAccepted: 6,
    },
    {
      listingId: "demo_lst_evening_kitchen",
      listingTitle: "Evening Kitchen Support",
      listingStatus: "live",
      applicationsByStatus: {
        applied: 7,
        reviewing: 3,
        saved_by_host: 1,
        offered: 2,
        accepted: 1,
        declined: 0,
        withdrawn: 0,
        not_selected: 3,
      },
      totalApplications: 17,
      invitesSent: 6,
      invitesAccepted: 2,
    },
  ],
};

/** The account-wide application total the stage counts add up to. */
export const DEMO_TOTAL_APPLICATIONS = 96;
/** Opportunity views the discovery-source split adds up to. */
export const DEMO_OPPORTUNITY_VIEWS = 3610;

export interface DemoMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly trend: string;
  readonly trendTone: "up" | "down" | "neutral";
  /** Sparkline heights 0–100 for the MetricCard primitive. */
  readonly spark: readonly number[];
  readonly demoLabel: DemoLabel;
}

/** Headline tiles. Every one carries the performance label the tiles render. */
export const DEMO_METRICS: readonly DemoMetric[] = [
  {
    id: "profile_views",
    label: "Profile views",
    value: "1,842",
    trend: "Last 30 days",
    trendTone: "up",
    spark: [22, 30, 26, 41, 48, 44, 57, 63, 61, 74],
    demoLabel: DEMO_PERFORMANCE_LABEL,
  },
  {
    id: "opportunity_views",
    label: "Opportunity views",
    value: "3,610",
    trend: "Across 3 live roles",
    trendTone: "up",
    spark: [18, 25, 33, 31, 44, 52, 58, 55, 68, 79],
    demoLabel: DEMO_PERFORMANCE_LABEL,
  },
  {
    id: "saves",
    label: "Saves",
    value: "214",
    trend: "Seekers watching",
    trendTone: "neutral",
    spark: [12, 18, 21, 27, 24, 33, 38, 42, 47, 51],
    demoLabel: DEMO_PERFORMANCE_LABEL,
  },
  {
    id: "applications",
    label: "Applications",
    value: "96",
    trend: "All time",
    trendTone: "up",
    spark: [8, 14, 19, 23, 29, 36, 44, 52, 61, 70],
    demoLabel: DEMO_PERFORMANCE_LABEL,
  },
  {
    id: "qualified_matches",
    label: "Qualified matches",
    value: "41",
    trend: "Score 75 and above",
    trendTone: "up",
    spark: [6, 9, 13, 16, 21, 25, 28, 32, 37, 41],
    demoLabel: DEMO_PERFORMANCE_LABEL,
  },
  {
    id: "view_to_application",
    label: "View to application",
    value: "2.7%",
    trend: "96 of 3,610 views",
    trendTone: "neutral",
    spark: [14, 17, 15, 21, 24, 22, 28, 31, 29, 34],
    demoLabel: DEMO_PERFORMANCE_LABEL,
  },
  {
    id: "time_to_first_application",
    label: "Time to first application",
    value: "6h 20m",
    trend: "After publishing",
    trendTone: "up",
    spark: [64, 58, 55, 47, 44, 38, 33, 30, 26, 22],
    demoLabel: DEMO_PERFORMANCE_LABEL,
  },
  {
    id: "invite_acceptance",
    label: "Invite acceptance",
    value: "56%",
    trend: "19 of 34 invites",
    trendTone: "up",
    spark: [20, 26, 31, 35, 33, 41, 46, 49, 53, 56],
    demoLabel: DEMO_PERFORMANCE_LABEL,
  },
];

export interface DemoSourceSplit {
  readonly id: "seek" | "swipe" | "map";
  readonly label: string;
  readonly href: string;
  readonly views: number;
  readonly share: string;
  readonly note: string;
  readonly demoLabel: DemoLabel;
}

/** Where the opportunity views came from. Counts sum to DEMO_OPPORTUNITY_VIEWS. */
export const DEMO_DISCOVERY_SOURCES: readonly DemoSourceSplit[] = [
  {
    id: "seek",
    label: "Seek",
    href: "/seek",
    views: 1661,
    share: "46%",
    note: "Filtered browsing — housing, meals, pay, lane, and dates.",
    demoLabel: DEMO_ANALYTICS_LABEL,
  },
  {
    id: "swipe",
    label: "Swipe",
    href: "/swipe",
    views: 1191,
    share: "33%",
    note: "One card at a time; a save is a strong signal.",
    demoLabel: DEMO_ANALYTICS_LABEL,
  },
  {
    id: "map",
    label: "Map",
    href: "/map",
    views: 758,
    share: "21%",
    note: "Place-first discovery for seekers who pick a region before a role.",
    demoLabel: DEMO_ANALYTICS_LABEL,
  },
];

export interface DemoFunnelStage {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly demoLabel: DemoLabel;
}

/** The application funnel. Counts mirror DEMO_ANALYTICS.totalApplicationsByStatus. */
export const DEMO_FUNNEL_STAGES: readonly DemoFunnelStage[] = [
  { id: "applied", label: "Applied", count: 38, demoLabel: DEMO_ANALYTICS_LABEL },
  { id: "reviewing", label: "Reviewing", count: 21, demoLabel: DEMO_ANALYTICS_LABEL },
  { id: "saved_by_host", label: "Saved", count: 9, demoLabel: DEMO_ANALYTICS_LABEL },
  { id: "offered", label: "Offered", count: 12, demoLabel: DEMO_ANALYTICS_LABEL },
  { id: "accepted", label: "Accepted", count: 7, demoLabel: DEMO_ANALYTICS_LABEL },
  { id: "declined", label: "Declined", count: 3, demoLabel: DEMO_ANALYTICS_LABEL },
  { id: "withdrawn", label: "Withdrawn", count: 2, demoLabel: DEMO_ANALYTICS_LABEL },
  {
    id: "not_selected",
    label: "Not selected",
    count: 4,
    demoLabel: DEMO_ANALYTICS_LABEL,
  },
];

export interface DemoPlanUsageRow {
  readonly id: string;
  readonly label: string;
  readonly used: number;
  /**
   * The plan's included figure. NEVER written here as a literal by a component:
   * the demo surfaces read the real entitlement from
   * packages/contracts PLAN_ENTITLEMENTS and compare it with `used`.
   */
  readonly entitlementKey: "listings" | "includedInviteCredits" | "monthlyAnnouncements";
  readonly note: string;
  readonly demoLabel: DemoLabel;
}

export const DEMO_PLAN_USAGE: readonly DemoPlanUsageRow[] = [
  {
    id: "listings",
    label: "Active listings",
    used: 3,
    entitlementKey: "listings",
    note: "Two more roles sit in drafts, ready to publish.",
    demoLabel: DEMO_ANALYTICS_LABEL,
  },
  {
    id: "invites",
    label: "Invite credits used this month",
    used: 12,
    entitlementKey: "includedInviteCredits",
    note: "Invites sent to seekers this workspace sourced.",
    demoLabel: DEMO_ANALYTICS_LABEL,
  },
  {
    id: "announcements",
    label: "Announcements used this month",
    used: 2,
    entitlementKey: "monthlyAnnouncements",
    note: "Extra runs can be purchased on top of the monthly allowance.",
    demoLabel: DEMO_ANALYTICS_LABEL,
  },
];

/** Drafts are unpublished and therefore not discoverable — stated, not implied. */
export const DEMO_DRAFT_COUNT = 2;

// ─── Announcements ─────────────────────────────────────────────────────────

export type DemoAnnouncementStatus = "draft" | "scheduled" | "published";

export interface DemoAnnouncementEngagement {
  readonly views: number;
  readonly saves: number;
  readonly opens: number;
}

export interface DemoAnnouncement {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly kind: "general" | "hiring" | "event";
  readonly status: DemoAnnouncementStatus;
  /** Human date string; a draft has none, which is why this is nullable. */
  readonly date: string | null;
  readonly dateLabel: string;
  readonly audience: string;
  /** Only a PUBLISHED announcement has engagement. Never invented for the rest. */
  readonly engagement: DemoAnnouncementEngagement | null;
  readonly demoLabel: DemoLabel;
}

export const DEMO_ANNOUNCEMENTS: readonly DemoAnnouncement[] = [
  {
    id: "demo_ann_season_open",
    title: "Lakeside hiring season is open",
    body: "Twenty-four seasonal roles across guest experience, trail, dock, and kitchen. Housing and two meals a day are included on every one.",
    kind: "hiring",
    status: "published",
    date: "Jun 1, 2026",
    dateLabel: "Published",
    audience: "All seekers",
    engagement: { views: 4120, saves: 96, opens: 311 },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_ann_housing_update",
    title: "Staff housing update: new lakeside cabins",
    body: "Four new staff cabins open this season, which means private rooms for the whole guest-experience crew instead of shared bunks.",
    kind: "general",
    status: "published",
    date: "Jun 14, 2026",
    dateLabel: "Published",
    audience: "Seekers who saved a role",
    engagement: { views: 2480, saves: 64, opens: 158 },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_ann_new_role",
    title: "New role: Evening kitchen support",
    body: "Added a fourth kitchen role for the peak weeks. Same housing, same meals, evening hours with mornings free.",
    kind: "hiring",
    status: "published",
    date: "Jun 28, 2026",
    dateLabel: "Published",
    audience: "All seekers",
    engagement: { views: 1905, saves: 51, opens: 140 },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_ann_deadline",
    title: "Applications close in two weeks",
    body: "Guest-experience and trail roles close on August 14. Anything already in review stays in review.",
    kind: "general",
    status: "scheduled",
    date: "Jul 30, 2026",
    dateLabel: "Scheduled for",
    audience: "Seekers matched to open roles",
    engagement: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_ann_interview_week",
    title: "Interview week is August 3–7",
    body: "Short video calls, twenty minutes each. Book a slot from your application thread once you are in review.",
    kind: "general",
    status: "scheduled",
    date: "Aug 1, 2026",
    dateLabel: "Scheduled for",
    audience: "Applicants in review",
    engagement: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_ann_regatta",
    title: "End-of-season staff regatta",
    body: "Crew boats, a barbecue on the point, and the season-completion bonus handed out on the dock.",
    kind: "event",
    status: "draft",
    date: null,
    dateLabel: "Draft",
    audience: "All seekers",
    engagement: null,
    demoLabel: DEMO_DATA_LABEL,
  },
];

// ─── Applicants + messaging ────────────────────────────────────────────────

export interface DemoApplicant {
  readonly id: string;
  /** Invented, and labelled as such on every surface that renders it. */
  readonly name: string;
  readonly headline: string;
  readonly stage: "applied" | "reviewing" | "offered";
  readonly stageLabel: string;
  readonly matchScore: number;
  readonly appliedLabel: string;
  readonly signals: readonly string[];
  readonly demoLabel: DemoLabel;
}

export const DEMO_APPLICANTS: readonly DemoApplicant[] = [
  {
    id: "demo_app_1",
    name: "Maya R.",
    headline: "Two seasons of guest services, wilderness first aid",
    stage: "offered",
    stageLabel: "Offered",
    matchScore: 94,
    appliedLabel: "Applied 3 days ago",
    signals: ["Available May–Sep", "Wants housing included", "Boat handling"],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_app_2",
    name: "Devin O.",
    headline: "Trail crew and dock hand, one prior lakeside season",
    stage: "reviewing",
    stageLabel: "Reviewing",
    matchScore: 88,
    appliedLabel: "Applied 5 days ago",
    signals: ["Available May–Sep", "Has own gear", "Entry level"],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_app_3",
    name: "Priya S.",
    headline: "Front-of-house hospitality, first seasonal role",
    stage: "reviewing",
    stageLabel: "Reviewing",
    matchScore: 81,
    appliedLabel: "Applied 6 days ago",
    signals: ["Needs housing", "Meals matter", "Entry level"],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_app_4",
    name: "Luis M.",
    headline: "Kitchen support, evening availability",
    stage: "applied",
    stageLabel: "New",
    matchScore: 76,
    appliedLabel: "Applied yesterday",
    signals: ["Evenings only", "Available Jun–Sep"],
    demoLabel: DEMO_DATA_LABEL,
  },
];

export interface DemoThread {
  readonly id: string;
  readonly applicantId: string;
  readonly name: string;
  readonly preview: string;
  readonly timeLabel: string;
  readonly unread: boolean;
  readonly demoLabel: DemoLabel;
}

export const DEMO_THREADS: readonly DemoThread[] = [
  {
    id: "demo_thread_1",
    applicantId: "demo_app_1",
    name: "Maya R.",
    preview:
      "Thanks for the offer — is the cabin a private room for the whole season?",
    timeLabel: "2h ago",
    unread: true,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_thread_2",
    applicantId: "demo_app_2",
    name: "Devin O.",
    preview: "I can start the first week of May. Happy to do trail and dock.",
    timeLabel: "Yesterday",
    unread: true,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_thread_3",
    applicantId: "demo_app_3",
    name: "Priya S.",
    preview: "Are the two meals a day on days off as well?",
    timeLabel: "Tuesday",
    unread: false,
    demoLabel: DEMO_DATA_LABEL,
  },
];

// ─── Workspace navigation ──────────────────────────────────────────────────

export interface DemoSurface {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly summary: string;
}

/** The demo workspace's own routes, in tour order. */
export const DEMO_SURFACES: readonly DemoSurface[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/for-hosts/demo",
    summary: "The workspace a host lands in, with the week's numbers up front.",
  },
  {
    id: "profile",
    label: "Employer profile",
    href: "/for-hosts/demo/profile",
    summary: "The public page every one of your roles hangs off.",
  },
  {
    id: "job",
    label: "Opportunity",
    href: "/for-hosts/demo/job",
    summary: "The listing as a seeker sees it — card and detail.",
  },
  {
    id: "applicants",
    label: "Applicants",
    href: "/for-hosts/demo/applicants",
    summary: "The pipeline, the match scores, and the message thread.",
  },
  {
    id: "announcements",
    label: "Announcements",
    href: "/for-hosts/demo/announcements",
    summary: "Drafts, scheduled runs, and what a published one did.",
  },
  {
    id: "dashboard",
    label: "Analytics",
    href: "/for-hosts/demo/dashboard",
    summary: "The real analytics dashboard, fed with sample figures.",
  },
];
