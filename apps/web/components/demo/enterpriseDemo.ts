import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";
import type { HostAnalytics, HostPerListingStats } from "@explore-and-earn/db";

import { formatCompensation } from "../../lib/format";
import { getSitePhoto } from "../../lib/sitePhotos";
import type { DiscoveryListing } from "../discovery/listing";

/**
 * Enterprise DEMO workspace — typed FIXTURES (spec D8, expanded by V2 D20).
 *
 * Follows components/discovery/fixtures.ts: one module, no backend, everything
 * typed against the frozen contracts. Nothing here is ever written to the
 * database and nothing here describes a real host, a real seeker, or a real
 * result. It exists so a signed-out visitor can walk the Enterprise experience
 * with the REAL product components before they pay for anything.
 *
 * ── TWO STRUCTURAL RULES, BOTH ENFORCED BY TESTS ───────────────────────────
 *
 * 1. THE LABELLING RULE IS STRUCTURAL, NOT EDITORIAL. Every collection carries
 *    a `demoLabel` on EVERY item, and the components render it. A label that
 *    lives in a page's JSX can be dropped by a later edit and nothing notices,
 *    whereas a missing label here is a type error and a failing test.
 *
 * 2. EVERY DISPLAYED AGGREGATE IS DERIVED FROM RECORDS. There is no second
 *    array of "headline numbers" sitting beside the records it summarises —
 *    that shape is how a dashboard ends up disagreeing with its own detail
 *    view. The individual applications, campaigns, announcements and weekly
 *    counters below are the ONLY stored quantities; every tile, funnel, split
 *    and usage bar is computed from them by an exported function, and
 *    tests/unit/demo-derivations.test.ts recomputes each one independently.
 *    Drift is therefore a test failure, not a rendering surprise.
 *
 * The numbers are plausible, not measured, and are never presented as measured.
 */

// ─── Labels ────────────────────────────────────────────────────────────────

/** Stamped on demo entities (org, roles, announcements, applicants, threads). */
export const DEMO_DATA_LABEL = "Demo data";
/** Stamped on demo performance figures (headline metric tiles). */
export const DEMO_PERFORMANCE_LABEL = "Example performance";
/** Stamped on demo analytics breakdowns (sources, funnel, plan usage). */
export const DEMO_ANALYTICS_LABEL = "Sample analytics";
/** Stamped on panels that stand in for a feed this product does not have yet. */
export const DEMO_SAMPLE_LABEL = "Sample data";

/** Every label a demo surface may render. The integrity test enumerates these. */
export const DEMO_LABELS = [
  DEMO_DATA_LABEL,
  DEMO_PERFORMANCE_LABEL,
  DEMO_ANALYTICS_LABEL,
  DEMO_SAMPLE_LABEL,
] as const;

export type DemoLabel = (typeof DEMO_LABELS)[number];

/** The one-line disclosure the persistent demo banner renders. */
export const DEMO_BANNER_TEXT =
  "Demo workspace — sample data. This is the Enterprise experience.";

/** Where "today" sits inside the fixture's season. Mid-season, on purpose. */
export const DEMO_TODAY_LABEL = "Tuesday, July 28";

// ─── Small derivations shared by several record types ──────────────────────

/**
 * Initials for a fictional person's avatar.
 *
 * FICTIONAL PEOPLE NEVER GET A PHOTOGRAPH. The site-photo catalog shows
 * scenes; presenting a real photographed person as a named applicant or
 * colleague of this product would be exactly the misrepresentation the
 * photography honesty rule forbids. Initials are the whole avatar system for
 * people in this workspace.
 */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

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
  readonly lane: OpportunityCategory;
  /** Site-photo catalog slug for the identity band. Scene, never a person. */
  readonly coverPhotoSlug: string;
  /** Second scene photograph for the season narrative. */
  readonly seasonPhotoSlug: string;
  readonly seasonLabel: string;
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
  coverPhotoSlug: "cda-lake-01",
  seasonPhotoSlug: "crew-01",
  seasonLabel: "Week 12 of 20 · Peak season",
  facts: [
    { label: "Season", value: "May 4 – Sep 20, 2026" },
    { label: "Crew size", value: "About 24 seasonal roles" },
    { label: "Housing", value: "On-site staff cabins" },
    { label: "Meals", value: "Two crew meals a day" },
  ],
  demoLabel: DEMO_DATA_LABEL,
};

// ─── Roles ─────────────────────────────────────────────────────────────────

export type DemoRoleStatus = "live" | "draft";

export interface DemoRoleHousing {
  readonly type: string;
  readonly summary: string;
  /** Integer cents the crew member pays. Zero means included, and says so. */
  readonly costCents: number;
}

export interface DemoRoleMeals {
  readonly summary: string;
  readonly costCents: number;
}

export interface DemoRole {
  readonly id: string;
  readonly title: string;
  readonly category: OpportunityCategory;
  readonly status: DemoRoleStatus;
  /** A live role whose application deadline is inside two weeks. */
  readonly closingSoon: boolean;
  /** Site-photo catalog slug. Category-appropriate scene photography. */
  readonly photoSlug: string;
  readonly summary: string;
  readonly description: readonly string[];
  readonly payMinCents: number;
  readonly payMaxCents: number;
  readonly payBasis: string;
  readonly payNote: string;
  readonly begins: string;
  readonly ends: string;
  readonly opportunityWindow: string;
  readonly hoursPerWeek: string;
  readonly schedule: readonly string[];
  readonly housing: DemoRoleHousing;
  readonly meals: DemoRoleMeals;
  readonly requirements: readonly string[];
  readonly benefits: readonly string[];
  readonly openPositions: number;
  /** Null for a draft: an unpublished role has no application deadline. */
  readonly deadline: string | null;
  readonly deadlineDaysAway: number | null;
  /** Views this role has taken. Zero on a draft — drafts are not discoverable. */
  readonly views: number;
  readonly saves: number;
  readonly invitesSent: number;
  readonly invitesAccepted: number;
  /** Minutes from publication to the first application. Null on a draft. */
  readonly minutesToFirstApplication: number | null;
  readonly demoLabel: DemoLabel;
}

export const ROLE_LAKESIDE = "demo_lst_lakeside_guest";
export const ROLE_DOCK_PADDLE = "demo_lst_dock_paddle";
export const ROLE_GUEST_SERVICES = "demo_lst_guest_services";
export const ROLE_TRAIL_GROUNDS = "demo_lst_trail_grounds";
export const ROLE_EVENING_KITCHEN = "demo_lst_evening_kitchen";
export const ROLE_FALL_RETREAT = "demo_lst_fall_retreat";
export const ROLE_WINTER_OPS = "demo_lst_winter_ops";

export const DEMO_ROLES: readonly DemoRole[] = [
  {
    id: ROLE_LAKESIDE,
    title: "Lakeside Guest Experience & Adventure Operations",
    category: "seasonal",
    status: "live",
    closingSoon: false,
    photoSlug: "paddle-01",
    summary:
      "Run the guest side of a lakeside season: morning boat departures, afternoon paddle programs, and the evening turn.",
    description: [
      "This is the role the season is built around. You open the water each morning, brief arriving guests, crew the boat and paddle programs through the day, and hand a clean board to the evening shift.",
      "Nobody arrives knowing all of it. Two weeks of paid training covers boat handling, the radio protocol, and the safety kit before you take a group out on your own.",
      "You live on the property in a staff cabin, eat two crew meals a day, and finish the season with a completion bonus and a reference that says what you actually did.",
    ],
    payMinCents: 2100,
    payMaxCents: 2500,
    payBasis: "per hour",
    payNote: "Housing and two meals a day sit on top of the hourly rate.",
    begins: "May 4, 2026",
    ends: "Sep 20, 2026",
    opportunityWindow: "May–Sep 2026",
    hoursPerWeek: "About 40 hours a week",
    schedule: [
      "Five days on, two off — days off rotate so nobody is stuck with midweek every week",
      "Morning block 6:30am–2:30pm or evening block 1:30pm–9:30pm",
      "One late close a week, rotated across the crew",
    ],
    housing: {
      type: "Private room in a shared staff cabin",
      summary:
        "Your own room in a four-bed cabin on the property. Linens, laundry and utilities covered.",
      costCents: 0,
    },
    meals: {
      summary:
        "Two crew meals a day, seven days a week, including days off. Kitchen keeps a vegetarian line at every service.",
      costCents: 0,
    },
    requirements: [
      "Comfortable in and around water; swim test on the first day",
      "Available for the full season, May 4 through September 20",
      "Wilderness First Aid or willing to certify in the paid training block",
      "18 or older — the boat programs require it",
    ],
    benefits: [
      "Season-completion bonus paid on the last day of the contract",
      "Gear access on days off: boats, boards and trail kit",
      "Crew paddle nights and an end-of-season gathering",
      "Written reference on request",
    ],
    openPositions: 6,
    deadline: "Aug 14, 2026",
    deadlineDaysAway: 17,
    views: 1420,
    saves: 84,
    invitesSent: 12,
    invitesAccepted: 7,
    minutesToFirstApplication: 380,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: ROLE_DOCK_PADDLE,
    title: "Dock & Paddle Crew",
    category: "maritime",
    status: "live",
    closingSoon: false,
    photoSlug: "dock-01",
    summary:
      "Keep the dock running: launches, returns, board and boat checks, and the gear log that keeps everyone safe.",
    description: [
      "The dock is the busiest twenty metres on the property. You launch and land every trip, keep the board and boat inventory straight, and log every safety check before a hull leaves the cleat.",
      "It is physical work in weather, and it is the role most crew say taught them the most. You will finish the season able to read a lake.",
      "Housing and meals are included on the same terms as every other role here.",
    ],
    payMinCents: 2000,
    payMaxCents: 2300,
    payBasis: "per hour",
    payNote: "Overtime paid at time and a half on regatta weekends.",
    begins: "May 11, 2026",
    ends: "Sep 20, 2026",
    opportunityWindow: "May–Sep 2026",
    hoursPerWeek: "38–42 hours a week",
    schedule: [
      "Dock opens 6:00am; two shifts cover through to 8:30pm",
      "Five days on, two off",
      "Regatta weekends are all hands, with the following Monday and Tuesday off",
    ],
    housing: {
      type: "Shared room in a staff cabin",
      summary:
        "Two to a room in a cabin fifty metres from the dock. Linens, laundry and utilities covered.",
      costCents: 0,
    },
    meals: {
      summary: "Two crew meals a day, seven days a week.",
      costCents: 0,
    },
    requirements: [
      "Strong swimmer; swim test on the first day",
      "Able to lift and carry boards and outboard kit through a shift",
      "Available May 11 through September 20",
      "Boat safety certification, or certify in the paid training block",
    ],
    benefits: [
      "Season-completion bonus",
      "Paid boat-safety certification",
      "Gear access on days off",
      "Written reference on request",
    ],
    openPositions: 4,
    deadline: "Aug 21, 2026",
    deadlineDaysAway: 24,
    views: 780,
    saves: 46,
    invitesSent: 8,
    invitesAccepted: 5,
    minutesToFirstApplication: 540,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: ROLE_GUEST_SERVICES,
    title: "Guest Services Coordinator",
    category: "seasonal",
    status: "live",
    closingSoon: true,
    photoSlug: "lodge-01",
    summary:
      "The front desk of the season: arrivals, bookings, the day board, and the answer to every question a guest asks.",
    description: [
      "You are the first person a guest meets and the last one they thank. Arrivals and departures, the day board, booking changes, and the radio that ties the water crew to the lodge all run through this desk.",
      "It suits somebody who likes order and does not mind six things arriving at once. Previous front-of-house experience helps; a calm morning voice helps more.",
      "This role closes first because it starts first — the desk has to be steady before the water opens.",
    ],
    payMinCents: 2200,
    payMaxCents: 2600,
    payBasis: "per hour",
    payNote: "Includes a shift differential for the early opening block.",
    begins: "May 4, 2026",
    ends: "Sep 27, 2026",
    opportunityWindow: "May–Sep 2026",
    hoursPerWeek: "40 hours a week",
    schedule: [
      "Desk opens 6:00am and closes 9:00pm across two shifts",
      "Five days on, two off, weekends rotate",
      "One opening block a week starts at 5:30am",
    ],
    housing: {
      type: "Private room in the lodge annexe",
      summary:
        "Private room with a shared bathroom in the annexe behind the lodge. Linens, laundry and utilities covered.",
      costCents: 0,
    },
    meals: {
      summary: "Two crew meals a day, seven days a week.",
      costCents: 0,
    },
    requirements: [
      "One season of front-of-house, hospitality or reception work",
      "Available May 4 through September 27",
      "Comfortable on a radio and with a booking system",
    ],
    benefits: [
      "Season-completion bonus",
      "Private room",
      "Crew activities and an end-of-season gathering",
      "Written reference on request",
    ],
    openPositions: 2,
    deadline: "Aug 3, 2026",
    deadlineDaysAway: 6,
    views: 620,
    saves: 36,
    invitesSent: 6,
    invitesAccepted: 3,
    minutesToFirstApplication: 720,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: ROLE_TRAIL_GROUNDS,
    title: "Trail & Grounds Crew",
    category: "seasonal",
    status: "live",
    closingSoon: false,
    photoSlug: "trail-01",
    summary:
      "Cut, clear and maintain the trail network, and keep the grounds guests walk through in good order.",
    description: [
      "Twelve miles of trail, a shoreline path, and the grounds around the cabins. You clear winter damage in May, keep the tread sound through summer, and close the network down in September.",
      "Tools and training are provided. If you have run a chainsaw before, say so; if you have not, you will learn on a certified course in week two.",
      "Mornings on the trail, afternoons on the grounds, and a genuinely quiet lunch.",
    ],
    payMinCents: 2000,
    payMaxCents: 2400,
    payBasis: "per hour",
    payNote: "Tool allowance paid on the first cheque.",
    begins: "May 4, 2026",
    ends: "Sep 20, 2026",
    opportunityWindow: "May–Sep 2026",
    hoursPerWeek: "40 hours a week",
    schedule: [
      "Trail block 7:00am–1:00pm, grounds block 2:00pm–4:30pm",
      "Five days on, two off — weekends usually off",
      "Weather days move to shop and gear work",
    ],
    housing: {
      type: "Shared room in a staff cabin",
      summary:
        "Two to a room in the upper cabins near the trailhead. Linens, laundry and utilities covered.",
      costCents: 0,
    },
    meals: {
      summary: "Two crew meals a day, plus a packed trail lunch on cutting days.",
      costCents: 0,
    },
    requirements: [
      "Comfortable with a full day of physical outdoor work",
      "Available May 4 through September 20",
      "Chainsaw certification, or certify on the paid course in week two",
    ],
    benefits: [
      "Season-completion bonus",
      "Paid chainsaw certification",
      "Trail and bike access on days off",
      "Written reference on request",
    ],
    openPositions: 3,
    deadline: "Aug 14, 2026",
    deadlineDaysAway: 17,
    views: 460,
    saves: 28,
    invitesSent: 5,
    invitesAccepted: 3,
    minutesToFirstApplication: 900,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: ROLE_EVENING_KITCHEN,
    title: "Evening Kitchen Team",
    category: "seasonal",
    status: "live",
    closingSoon: false,
    photoSlug: "kitchen-01",
    summary:
      "Evening service for guests and the crew meal that follows it. Mornings free, all season.",
    description: [
      "Prep from two, service from five, crew meal at nine. The kitchen feeds guests and then feeds the people who ran the lake all day, which is the meal everyone actually remembers.",
      "The head cook has run this kitchen for four seasons. Line experience is welcome and not required — the training block covers the stations.",
      "Mornings are yours. Several of the crew who take this role spend them on the water.",
    ],
    payMinCents: 2100,
    payMaxCents: 2400,
    payBasis: "per hour",
    payNote: "Evening differential included in the range.",
    begins: "Jun 1, 2026",
    ends: "Sep 20, 2026",
    opportunityWindow: "Jun–Sep 2026",
    hoursPerWeek: "36–40 hours a week",
    schedule: [
      "Prep 2:00pm, service 5:00pm–8:30pm, crew meal and close by 10:00pm",
      "Five days on, two off",
      "Mornings free every day of the season",
    ],
    housing: {
      type: "Private room in a shared staff cabin",
      summary:
        "Your own room in the lower cabins, five minutes from the kitchen door. Linens, laundry and utilities covered.",
      costCents: 0,
    },
    meals: {
      summary: "Two crew meals a day, and you will be cooking one of them.",
      costCents: 0,
    },
    requirements: [
      "Food handler certification, or certify in the first week",
      "Available June 1 through September 20",
      "Comfortable on your feet through an evening service",
    ],
    benefits: [
      "Season-completion bonus",
      "Mornings free all season",
      "Paid food handler certification",
      "Written reference on request",
    ],
    openPositions: 3,
    deadline: "Aug 21, 2026",
    deadlineDaysAway: 24,
    views: 330,
    saves: 20,
    invitesSent: 3,
    invitesAccepted: 1,
    minutesToFirstApplication: 1260,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: ROLE_FALL_RETREAT,
    title: "Fall Retreat Host",
    category: "seasonal",
    status: "draft",
    closingSoon: false,
    photoSlug: "lodge-02",
    summary:
      "Shoulder-season retreats in the lodge: small groups, long weekends, and a quieter lake.",
    description: [
      "A draft for the shoulder season. Retreat groups book the lodge from late September through the first week of November, and this role hosts them: arrivals, meals with the kitchen, and one guided walk a day.",
      "The dates and the rate are still being worked out with the retreat partners, which is why this one has not been published.",
    ],
    payMinCents: 2200,
    payMaxCents: 2600,
    payBasis: "per hour",
    payNote: "Rate still under review with the retreat partners.",
    begins: "Sep 28, 2026",
    ends: "Nov 8, 2026",
    opportunityWindow: "Sep–Nov 2026",
    hoursPerWeek: "32–36 hours a week",
    schedule: [
      "Thursday to Sunday retreat blocks",
      "Mondays and Tuesdays off between groups",
    ],
    housing: {
      type: "Private room in the lodge annexe",
      summary: "Private room with a shared bathroom in the annexe.",
      costCents: 0,
    },
    meals: {
      summary: "Meals with the retreat groups on service days.",
      costCents: 0,
    },
    requirements: [
      "Hosting or guiding experience",
      "Available late September through early November",
    ],
    benefits: ["Private room", "Meals on service days", "Written reference on request"],
    openPositions: 2,
    deadline: null,
    deadlineDaysAway: null,
    views: 0,
    saves: 0,
    invitesSent: 0,
    invitesAccepted: 0,
    minutesToFirstApplication: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: ROLE_WINTER_OPS,
    title: "Winter Operations Assistant",
    category: "seasonal",
    status: "draft",
    closingSoon: false,
    photoSlug: "idaho-01",
    summary:
      "Off-season property care: snow, structures, gear repair, and getting the place ready for May.",
    description: [
      "A draft for the first winter the property will be staffed. Snow clearing, structure checks, gear repair in the shop, and the long rebuild of everything the season broke.",
      "Housing terms for winter are not settled yet — the lower cabins are not winterised — so this stays a draft until that is answered honestly.",
    ],
    payMinCents: 2300,
    payMaxCents: 2700,
    payBasis: "per hour",
    payNote: "Winter housing terms unresolved; rate reflects that.",
    begins: "Nov 16, 2026",
    ends: "Apr 4, 2027",
    opportunityWindow: "Nov 2026 – Apr 2027",
    hoursPerWeek: "30–40 hours a week, weather dependent",
    schedule: [
      "Four days on, three off, storm weeks excepted",
      "Shop work on days the road is closed",
    ],
    housing: {
      type: "Under review",
      summary:
        "The lower cabins are not winterised. Housing for this role is unresolved and the draft says so rather than promising a room.",
      costCents: 0,
    },
    meals: {
      summary: "Kitchen is closed off-season; meals are not provided for this role.",
      costCents: 0,
    },
    requirements: [
      "Comfortable working alone in winter conditions",
      "Small-engine or general maintenance experience",
    ],
    benefits: ["Shop access", "Written reference on request"],
    openPositions: 1,
    deadline: null,
    deadlineDaysAway: null,
    views: 0,
    saves: 0,
    invitesSent: 0,
    invitesAccepted: 0,
    minutesToFirstApplication: null,
    demoLabel: DEMO_DATA_LABEL,
  },
];

const ROLE_BY_ID: ReadonlyMap<string, DemoRole> = new Map(
  DEMO_ROLES.map((role) => [role.id, role]),
);

export function demoRole(id: string): DemoRole {
  const role = ROLE_BY_ID.get(id);
  if (!role) throw new Error(`Unknown demo role "${id}"`);
  return role;
}

/** Live roles, in workspace order. Drafts are never discoverable. */
export const DEMO_LIVE_ROLES: readonly DemoRole[] = DEMO_ROLES.filter(
  (role) => role.status === "live",
);
export const DEMO_DRAFT_ROLES: readonly DemoRole[] = DEMO_ROLES.filter(
  (role) => role.status === "draft",
);
/** Kept for the plan-usage copy; DERIVED, never typed as its own literal. */
export const DEMO_DRAFT_COUNT = DEMO_DRAFT_ROLES.length;

/** The flagship role every "as a seeker sees it" surface renders. */
export const DEMO_FLAGSHIP_ROLE = demoRole(ROLE_LAKESIDE);

// ─── Applicants ────────────────────────────────────────────────────────────

/**
 * The workspace pipeline's stage vocabulary.
 *
 * Richer than the stored `APPLICATION_STATUS` enum by exactly one column:
 * "interview". An interview is a booked event against an application that is
 * still in review, so `storedStatusFor` folds it back into "reviewing" when the
 * fixture builds a HostAnalytics object. That fold is a documented mapping with
 * a test, NOT a second set of numbers: both views are computed from these same
 * records, and the analytics surface says in words that the reviewing column
 * contains the applications with an interview booked.
 */
export type DemoStage =
  | "new"
  | "reviewing"
  | "saved"
  | "interview"
  | "offer"
  | "accepted"
  | "not_selected"
  | "withdrawn";

export const DEMO_STAGE_ORDER: readonly DemoStage[] = [
  "new",
  "reviewing",
  "saved",
  "interview",
  "offer",
  "accepted",
  "not_selected",
  "withdrawn",
];

export const DEMO_STAGE_LABEL: Readonly<Record<DemoStage, string>> = {
  new: "New",
  reviewing: "Reviewing",
  saved: "Saved",
  interview: "Interview",
  offer: "Offer out",
  accepted: "Accepted",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

/** Stages a host can move a candidate INTO from the demo pipeline. */
export const DEMO_MOVABLE_STAGES: readonly DemoStage[] = [
  "new",
  "reviewing",
  "saved",
  "interview",
  "offer",
  "accepted",
  "not_selected",
];

/** The demo stage → stored APPLICATION_STATUS mapping. Documented above. */
export const STORED_STATUS_FOR_STAGE: Readonly<Record<DemoStage, string>> = {
  new: "applied",
  reviewing: "reviewing",
  interview: "reviewing",
  saved: "saved_by_host",
  offer: "offered",
  accepted: "accepted",
  not_selected: "not_selected",
  withdrawn: "withdrawn",
};

/** A match score at or above this counts as a qualified match. */
export const QUALIFIED_MATCH_THRESHOLD = 75;

export interface DemoApplicant {
  readonly id: string;
  /** Invented, and labelled as such on every surface that renders it. */
  readonly name: string;
  /** Derived from the name. The ONLY avatar a fictional person ever gets. */
  readonly initials: string;
  readonly location: string;
  /** The role applied to — the join every per-role aggregate is built on. */
  readonly roleId: string;
  readonly stage: DemoStage;
  readonly matchScore: number;
  readonly appliedOn: string;
  readonly appliedDaysAgo: number;
  readonly availability: string;
  readonly experience: string;
  readonly certifications: readonly string[];
  readonly needsHousing: boolean;
  readonly note: string;
  readonly demoLabel: DemoLabel;
}

type ApplicantSeed = Omit<DemoApplicant, "initials" | "demoLabel">;

const APPLICANT_SEEDS: readonly ApplicantSeed[] = [
  // ── Lakeside Guest Experience & Adventure Operations (34) ────────────────
  {
    id: "apl-001", name: "Maya Reyes", location: "Bozeman, Montana",
    roleId: ROLE_LAKESIDE, stage: "offer", matchScore: 94,
    appliedOn: "Jul 12", appliedDaysAgo: 16,
    availability: "May 2 – Sep 22", experience: "Two seasons of guest services at a lake resort",
    certifications: ["Wilderness First Aid", "Boat safety"], needsHousing: true,
    note: "Asked whether the cabin room is private for the whole season.",
  },
  {
    id: "apl-002", name: "Devin Okonkwo", location: "Spokane, Washington",
    roleId: ROLE_LAKESIDE, stage: "accepted", matchScore: 92,
    appliedOn: "Jun 18", appliedDaysAgo: 40,
    availability: "May 4 – Sep 20", experience: "One prior lakeside season, dock and guest side",
    certifications: ["Wilderness First Aid", "Lifeguard"], needsHousing: true,
    note: "Accepted on the spot; arriving with their own paddle kit.",
  },
  {
    id: "apl-003", name: "Priya Shah", location: "Portland, Oregon",
    roleId: ROLE_LAKESIDE, stage: "interview", matchScore: 89,
    appliedOn: "Jul 6", appliedDaysAgo: 22,
    availability: "May 4 – Sep 20", experience: "Front-of-house hospitality, first seasonal role",
    certifications: ["Food handler"], needsHousing: true,
    note: "Interview booked for the August 3 block.",
  },
  {
    id: "apl-004", name: "Luis Marchetti", location: "Boise, Idaho",
    roleId: ROLE_LAKESIDE, stage: "reviewing", matchScore: 86,
    appliedOn: "Jul 21", appliedDaysAgo: 7,
    availability: "May 11 – Sep 20", experience: "Raft guide, three summers on the Payette",
    certifications: ["Swiftwater rescue", "Wilderness First Responder"], needsHousing: true,
    note: "Strong water background; late start by one week.",
  },
  {
    id: "apl-005", name: "Hana Lindqvist", location: "Seattle, Washington",
    roleId: ROLE_LAKESIDE, stage: "saved", matchScore: 84,
    appliedOn: "Jul 9", appliedDaysAgo: 19,
    availability: "May 4 – Sep 20", experience: "Two seasons of adventure programming for a youth camp",
    certifications: ["Wilderness First Aid"], needsHousing: true,
    note: "Saved for the second wave of interviews.",
  },
  {
    id: "apl-006", name: "Theo Bramble", location: "Missoula, Montana",
    roleId: ROLE_LAKESIDE, stage: "offer", matchScore: 88,
    appliedOn: "Jul 2", appliedDaysAgo: 26,
    availability: "May 4 – Sep 27", experience: "Guide and shuttle driver, two seasons",
    certifications: ["Wilderness First Aid", "Commercial driver"], needsHousing: true,
    note: "Offer sent; waiting on a housing question about storage.",
  },
  {
    id: "apl-007", name: "Amara Nwosu", location: "Denver, Colorado",
    roleId: ROLE_LAKESIDE, stage: "accepted", matchScore: 91,
    appliedOn: "Jun 22", appliedDaysAgo: 36,
    availability: "May 4 – Sep 20", experience: "Resort guest experience lead, one season",
    certifications: ["Wilderness First Aid", "Lifeguard"], needsHousing: false,
    note: "Has family nearby; declined housing, kept the meals.",
  },
  {
    id: "apl-008", name: "Colin Vasquez", location: "Sandpoint, Idaho",
    roleId: ROLE_LAKESIDE, stage: "interview", matchScore: 83,
    appliedOn: "Jul 15", appliedDaysAgo: 13,
    availability: "May 4 – Sep 20", experience: "Marina hand, two summers",
    certifications: ["Boat safety"], needsHousing: false,
    note: "Local; interview booked for the August 3 block.",
  },
  {
    id: "apl-009", name: "Sofia Andersen", location: "Salt Lake City, Utah",
    roleId: ROLE_LAKESIDE, stage: "interview", matchScore: 81,
    appliedOn: "Jul 17", appliedDaysAgo: 11,
    availability: "May 18 – Sep 20", experience: "Ski-season guest services, first summer role",
    certifications: ["First aid"], needsHousing: true,
    note: "Two-week late start; flagged it themselves.",
  },
  {
    id: "apl-010", name: "Nate Okafor", location: "Coeur d'Alene, Idaho",
    roleId: ROLE_LAKESIDE, stage: "offer", matchScore: 87,
    appliedOn: "Jul 4", appliedDaysAgo: 24,
    availability: "May 4 – Sep 20", experience: "Two seasons on the lake, guest and dock side",
    certifications: ["Boat safety", "Wilderness First Aid"], needsHousing: false,
    note: "Offer out; local, no housing needed.",
  },
  {
    id: "apl-011", name: "Iris Kowalski", location: "Chicago, Illinois",
    roleId: ROLE_LAKESIDE, stage: "saved", matchScore: 80,
    appliedOn: "Jul 11", appliedDaysAgo: 17,
    availability: "Jun 1 – Sep 20", experience: "Camp counsellor, three summers",
    certifications: ["Lifeguard", "First aid"], needsHousing: true,
    note: "Saved; June start works for the second intake.",
  },
  {
    id: "apl-012", name: "Marcus Bell", location: "Reno, Nevada",
    roleId: ROLE_LAKESIDE, stage: "saved", matchScore: 73,
    appliedOn: "Jul 13", appliedDaysAgo: 15,
    availability: "May 4 – Sep 20", experience: "Retail and event work, first outdoor role",
    certifications: [], needsHousing: true,
    note: "Saved; would need the full training block.",
  },
  {
    id: "apl-013", name: "Yuki Tanaka", location: "Vancouver, Washington",
    roleId: ROLE_LAKESIDE, stage: "saved", matchScore: 72,
    appliedOn: "Jul 19", appliedDaysAgo: 9,
    availability: "May 4 – Sep 13", experience: "Kayak instructor, one season",
    certifications: ["Paddle instructor"], needsHousing: true,
    note: "Leaves a week early for a course; saved pending a decision.",
  },
  {
    id: "apl-014", name: "Elena Brandt", location: "Minneapolis, Minnesota",
    roleId: ROLE_LAKESIDE, stage: "reviewing", matchScore: 79,
    appliedOn: "Jul 20", appliedDaysAgo: 8,
    availability: "May 4 – Sep 20", experience: "Hotel front desk, two years",
    certifications: ["First aid"], needsHousing: true,
    note: "Solid hospitality background, no water time yet.",
  },
  {
    id: "apl-015", name: "Jonah Ferreira", location: "Eugene, Oregon",
    roleId: ROLE_LAKESIDE, stage: "reviewing", matchScore: 77,
    appliedOn: "Jul 22", appliedDaysAgo: 6,
    availability: "May 4 – Sep 20", experience: "Landscaping and trail work, two seasons",
    certifications: ["Chainsaw"], needsHousing: true,
    note: "Might be a better fit for trail; flagged for a cross-look.",
  },
  {
    id: "apl-016", name: "Robin Achterberg", location: "Calgary, Alberta",
    roleId: ROLE_LAKESIDE, stage: "reviewing", matchScore: 72,
    appliedOn: "Jul 23", appliedDaysAgo: 5,
    availability: "Jun 15 – Sep 20", experience: "Barista and event staff",
    certifications: ["Food handler"], needsHousing: true,
    note: "Cross-border paperwork not confirmed.",
  },
  {
    id: "apl-017", name: "Dani Ruiz", location: "Tucson, Arizona",
    roleId: ROLE_LAKESIDE, stage: "reviewing", matchScore: 70,
    appliedOn: "Jul 24", appliedDaysAgo: 4,
    availability: "May 4 – Aug 30", experience: "Pool attendant, one summer",
    certifications: ["Lifeguard"], needsHousing: true,
    note: "Leaves three weeks early; needs a conversation.",
  },
  {
    id: "apl-018", name: "Freya Nilsen", location: "Fargo, North Dakota",
    roleId: ROLE_LAKESIDE, stage: "reviewing", matchScore: 68,
    appliedOn: "Jul 24", appliedDaysAgo: 4,
    availability: "May 4 – Sep 20", experience: "Grocery supervisor, no seasonal work yet",
    certifications: [], needsHousing: true,
    note: "Keen and untested; training block would carry them.",
  },
  {
    id: "apl-019", name: "Omar Haddad", location: "Sacramento, California",
    roleId: ROLE_LAKESIDE, stage: "new", matchScore: 82,
    appliedOn: "Jul 27", appliedDaysAgo: 1,
    availability: "May 4 – Sep 20", experience: "Sailing instructor, two seasons",
    certifications: ["Boat safety", "First aid"], needsHousing: true,
    note: "Applied yesterday; strong water background.",
  },
  {
    id: "apl-020", name: "Greta Lindholm", location: "Duluth, Minnesota",
    roleId: ROLE_LAKESIDE, stage: "new", matchScore: 74,
    appliedOn: "Jul 27", appliedDaysAgo: 1,
    availability: "May 4 – Sep 20", experience: "Outfitter shop and guiding, one season",
    certifications: ["Wilderness First Aid"], needsHousing: true,
    note: "Applied yesterday.",
  },
  {
    id: "apl-021", name: "Tobias Reyes", location: "Boulder, Colorado",
    roleId: ROLE_LAKESIDE, stage: "new", matchScore: 73,
    appliedOn: "Jul 26", appliedDaysAgo: 2,
    availability: "Jun 1 – Sep 20", experience: "Climbing gym staff",
    certifications: ["First aid"], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-022", name: "Nadia Petrov", location: "Kalispell, Montana",
    roleId: ROLE_LAKESIDE, stage: "new", matchScore: 71,
    appliedOn: "Jul 26", appliedDaysAgo: 2,
    availability: "May 4 – Sep 20", experience: "Hotel housekeeping supervisor",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-023", name: "Ellis Monroe", location: "Wenatchee, Washington",
    roleId: ROLE_LAKESIDE, stage: "new", matchScore: 69,
    appliedOn: "Jul 25", appliedDaysAgo: 3,
    availability: "May 11 – Sep 20", experience: "Orchard crew, two seasons",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-024", name: "Sana Qureshi", location: "Toronto, Ontario",
    roleId: ROLE_LAKESIDE, stage: "new", matchScore: 66,
    appliedOn: "Jul 25", appliedDaysAgo: 3,
    availability: "Jun 8 – Sep 20", experience: "Museum front desk",
    certifications: [], needsHousing: true,
    note: "Cross-border paperwork not confirmed.",
  },
  {
    id: "apl-025", name: "Beau Chastain", location: "Nashville, Tennessee",
    roleId: ROLE_LAKESIDE, stage: "new", matchScore: 64,
    appliedOn: "Jul 24", appliedDaysAgo: 4,
    availability: "May 4 – Sep 20", experience: "Bar back and door staff",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-026", name: "Ingrid Salas", location: "Anchorage, Alaska",
    roleId: ROLE_LAKESIDE, stage: "new", matchScore: 62,
    appliedOn: "Jul 24", appliedDaysAgo: 4,
    availability: "Jun 22 – Sep 20", experience: "Cannery line, one season",
    certifications: ["Food handler"], needsHousing: true,
    note: "Late start; new this week.",
  },
  {
    id: "apl-027", name: "Caleb Whitfield", location: "Bend, Oregon",
    roleId: ROLE_LAKESIDE, stage: "not_selected", matchScore: 58,
    appliedOn: "Jun 12", appliedDaysAgo: 46,
    availability: "Jul 6 – Aug 30", experience: "Warehouse picker",
    certifications: [], needsHousing: true,
    note: "Availability covers under half the season.",
  },
  {
    id: "apl-028", name: "Rosa Delgado", location: "Fresno, California",
    roleId: ROLE_LAKESIDE, stage: "not_selected", matchScore: 55,
    appliedOn: "Jun 15", appliedDaysAgo: 43,
    availability: "Aug 1 – Sep 20", experience: "Retail associate",
    certifications: [], needsHousing: true,
    note: "Available for the last six weeks only.",
  },
  {
    id: "apl-029", name: "Mikhail Orlov", location: "Chicago, Illinois",
    roleId: ROLE_LAKESIDE, stage: "not_selected", matchScore: 61,
    appliedOn: "Jun 20", appliedDaysAgo: 38,
    availability: "May 4 – Sep 20", experience: "Rideshare driver",
    certifications: [], needsHousing: false,
    note: "Declined the swim requirement.",
  },
  {
    id: "apl-030", name: "Talia Ferris", location: "Austin, Texas",
    roleId: ROLE_LAKESIDE, stage: "not_selected", matchScore: 77,
    appliedOn: "Jun 24", appliedDaysAgo: 34,
    availability: "May 4 – Sep 20", experience: "Camp programme director, four summers",
    certifications: ["Wilderness First Responder", "Lifeguard"], needsHousing: true,
    note: "Strong, but took a director role elsewhere before the offer went out.",
  },
  {
    id: "apl-031", name: "Wes Kimura", location: "Honolulu, Hawaii",
    roleId: ROLE_LAKESIDE, stage: "not_selected", matchScore: 63,
    appliedOn: "Jun 28", appliedDaysAgo: 30,
    availability: "May 4 – Sep 20", experience: "Surf shop and rentals",
    certifications: ["First aid"], needsHousing: true,
    note: "Relocation cost was the blocker on their side.",
  },
  {
    id: "apl-032", name: "Priscilla Vance", location: "Cheyenne, Wyoming",
    roleId: ROLE_LAKESIDE, stage: "not_selected", matchScore: 52,
    appliedOn: "Jul 1", appliedDaysAgo: 27,
    availability: "May 4 – Jun 30", experience: "Ranch hand",
    certifications: [], needsHousing: true,
    note: "Eight weeks of a twenty-week season.",
  },
  {
    id: "apl-033", name: "Arjun Mehta", location: "San Jose, California",
    roleId: ROLE_LAKESIDE, stage: "withdrawn", matchScore: 74,
    appliedOn: "Jun 30", appliedDaysAgo: 28,
    availability: "May 4 – Sep 20", experience: "Outdoor retail, one guiding season",
    certifications: ["First aid"], needsHousing: true,
    note: "Withdrew — took a role closer to home.",
  },
  {
    id: "apl-034", name: "Lena Fischer", location: "Portland, Maine",
    roleId: ROLE_LAKESIDE, stage: "withdrawn", matchScore: 67,
    appliedOn: "Jul 3", appliedDaysAgo: 25,
    availability: "May 4 – Sep 20", experience: "Harbour tour crew, one season",
    certifications: ["Boat safety"], needsHousing: true,
    note: "Withdrew — could not make the travel work.",
  },

  // ── Dock & Paddle Crew (21) ──────────────────────────────────────────────
  {
    id: "apl-035", name: "Kai Fontaine", location: "Coeur d'Alene, Idaho",
    roleId: ROLE_DOCK_PADDLE, stage: "accepted", matchScore: 93,
    appliedOn: "Jun 16", appliedDaysAgo: 42,
    availability: "May 11 – Sep 20", experience: "Two seasons on this dock",
    certifications: ["Boat safety", "Swiftwater rescue"], needsHousing: false,
    note: "Returning crew; accepted in June.",
  },
  {
    id: "apl-036", name: "Simone Tavares", location: "Spokane, Washington",
    roleId: ROLE_DOCK_PADDLE, stage: "offer", matchScore: 90,
    appliedOn: "Jul 8", appliedDaysAgo: 20,
    availability: "May 11 – Sep 20", experience: "Paddle guide, three seasons",
    certifications: ["Paddle instructor", "Wilderness First Aid"], needsHousing: true,
    note: "Offer out; asked about board storage over winter.",
  },
  {
    id: "apl-037", name: "Bryn Halloran", location: "Missoula, Montana",
    roleId: ROLE_DOCK_PADDLE, stage: "offer", matchScore: 85,
    appliedOn: "Jul 10", appliedDaysAgo: 18,
    availability: "May 11 – Sep 20", experience: "Raft guide, two seasons",
    certifications: ["Swiftwater rescue"], needsHousing: true,
    note: "Offer out this week.",
  },
  {
    id: "apl-038", name: "Zara Idris", location: "Seattle, Washington",
    roleId: ROLE_DOCK_PADDLE, stage: "interview", matchScore: 84,
    appliedOn: "Jul 14", appliedDaysAgo: 14,
    availability: "May 11 – Sep 20", experience: "Sailing club dockhand, two summers",
    certifications: ["Boat safety"], needsHousing: true,
    note: "Interview booked for the August 3 block.",
  },
  {
    id: "apl-039", name: "Rowan Priest", location: "Sandpoint, Idaho",
    roleId: ROLE_DOCK_PADDLE, stage: "interview", matchScore: 80,
    appliedOn: "Jul 16", appliedDaysAgo: 12,
    availability: "May 11 – Sep 20", experience: "Marina fuel dock, one season",
    certifications: ["Boat safety"], needsHousing: false,
    note: "Local; interview booked.",
  },
  {
    id: "apl-040", name: "Imani Clarke", location: "Portland, Oregon",
    roleId: ROLE_DOCK_PADDLE, stage: "saved", matchScore: 82,
    appliedOn: "Jul 12", appliedDaysAgo: 16,
    availability: "Jun 1 – Sep 20", experience: "Rowing club coach",
    certifications: ["First aid"], needsHousing: true,
    note: "Saved for the June intake.",
  },
  {
    id: "apl-041", name: "Felix Draper", location: "Boise, Idaho",
    roleId: ROLE_DOCK_PADDLE, stage: "saved", matchScore: 79,
    appliedOn: "Jul 18", appliedDaysAgo: 10,
    availability: "May 11 – Sep 20", experience: "Pool and beach lifeguard, two summers",
    certifications: ["Lifeguard"], needsHousing: true,
    note: "Saved; needs the boat certification block.",
  },
  {
    id: "apl-042", name: "Noor Al-Amin", location: "Vancouver, British Columbia",
    roleId: ROLE_DOCK_PADDLE, stage: "saved", matchScore: 73,
    appliedOn: "Jul 19", appliedDaysAgo: 9,
    availability: "May 25 – Sep 20", experience: "Kayak rentals, one season",
    certifications: ["Paddle instructor"], needsHousing: true,
    note: "Cross-border paperwork in progress.",
  },
  {
    id: "apl-043", name: "Gideon Marsh", location: "Salt Lake City, Utah",
    roleId: ROLE_DOCK_PADDLE, stage: "reviewing", matchScore: 78,
    appliedOn: "Jul 21", appliedDaysAgo: 7,
    availability: "May 11 – Sep 20", experience: "Reservoir patrol, one season",
    certifications: ["Boat safety"], needsHousing: true,
    note: "Under review this week.",
  },
  {
    id: "apl-044", name: "Camila Duarte", location: "Denver, Colorado",
    roleId: ROLE_DOCK_PADDLE, stage: "reviewing", matchScore: 74,
    appliedOn: "Jul 22", appliedDaysAgo: 6,
    availability: "May 11 – Sep 20", experience: "Gear shop and rentals",
    certifications: [], needsHousing: true,
    note: "Under review.",
  },
  {
    id: "apl-045", name: "Hugo Brennan", location: "Spokane, Washington",
    roleId: ROLE_DOCK_PADDLE, stage: "reviewing", matchScore: 71,
    appliedOn: "Jul 23", appliedDaysAgo: 5,
    availability: "May 11 – Sep 20", experience: "Warehouse and forklift",
    certifications: [], needsHousing: false,
    note: "Local; strong on the lifting side, no water time.",
  },
  {
    id: "apl-046", name: "Aisha Bello", location: "Minneapolis, Minnesota",
    roleId: ROLE_DOCK_PADDLE, stage: "reviewing", matchScore: 69,
    appliedOn: "Jul 24", appliedDaysAgo: 4,
    availability: "Jun 8 – Sep 20", experience: "Summer camp waterfront assistant",
    certifications: ["Lifeguard"], needsHousing: true,
    note: "Under review.",
  },
  {
    id: "apl-047", name: "Soren Vaught", location: "Bend, Oregon",
    roleId: ROLE_DOCK_PADDLE, stage: "new", matchScore: 81,
    appliedOn: "Jul 27", appliedDaysAgo: 1,
    availability: "May 11 – Sep 20", experience: "River outfitter, two seasons",
    certifications: ["Swiftwater rescue", "First aid"], needsHousing: true,
    note: "Applied yesterday.",
  },
  {
    id: "apl-048", name: "Marisol Cabrera", location: "Reno, Nevada",
    roleId: ROLE_DOCK_PADDLE, stage: "new", matchScore: 73,
    appliedOn: "Jul 27", appliedDaysAgo: 1,
    availability: "May 11 – Sep 20", experience: "Beach rentals, one summer",
    certifications: [], needsHousing: true,
    note: "Applied yesterday.",
  },
  {
    id: "apl-049", name: "Dermot Lynch", location: "Helena, Montana",
    roleId: ROLE_DOCK_PADDLE, stage: "new", matchScore: 70,
    appliedOn: "Jul 26", appliedDaysAgo: 2,
    availability: "May 11 – Sep 20", experience: "Groundskeeping",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-050", name: "Petra Novak", location: "Chicago, Illinois",
    roleId: ROLE_DOCK_PADDLE, stage: "new", matchScore: 67,
    appliedOn: "Jul 26", appliedDaysAgo: 2,
    availability: "Jun 1 – Sep 20", experience: "Bike shop mechanic",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-051", name: "Jules Ferrand", location: "Tacoma, Washington",
    roleId: ROLE_DOCK_PADDLE, stage: "new", matchScore: 65,
    appliedOn: "Jul 25", appliedDaysAgo: 3,
    availability: "May 11 – Aug 24", experience: "Ferry terminal staff",
    certifications: [], needsHousing: true,
    note: "Leaves four weeks early.",
  },
  {
    id: "apl-052", name: "Rhea Sandoval", location: "Albuquerque, New Mexico",
    roleId: ROLE_DOCK_PADDLE, stage: "not_selected", matchScore: 57,
    appliedOn: "Jun 26", appliedDaysAgo: 32,
    availability: "Jul 20 – Sep 20", experience: "Retail",
    certifications: [], needsHousing: true,
    note: "Two months of a season that started in May.",
  },
  {
    id: "apl-053", name: "Ivan Grbic", location: "Cleveland, Ohio",
    roleId: ROLE_DOCK_PADDLE, stage: "not_selected", matchScore: 60,
    appliedOn: "Jun 29", appliedDaysAgo: 29,
    availability: "May 11 – Sep 20", experience: "Landscaping",
    certifications: [], needsHousing: true,
    note: "Declined the swim test.",
  },
  {
    id: "apl-054", name: "Odette Laurent", location: "Montreal, Quebec",
    roleId: ROLE_DOCK_PADDLE, stage: "not_selected", matchScore: 72,
    appliedOn: "Jul 2", appliedDaysAgo: 26,
    availability: "May 11 – Sep 20", experience: "Canoe outfitter, two seasons",
    certifications: ["Paddle instructor"], needsHousing: true,
    note: "Work authorisation could not be confirmed for the season.",
  },
  {
    id: "apl-055", name: "Barrett Cole", location: "Kansas City, Missouri",
    roleId: ROLE_DOCK_PADDLE, stage: "withdrawn", matchScore: 68,
    appliedOn: "Jul 5", appliedDaysAgo: 23,
    availability: "May 11 – Sep 20", experience: "Pool maintenance",
    certifications: ["Lifeguard"], needsHousing: true,
    note: "Withdrew before the interview block.",
  },

  // ── Guest Services Coordinator (17) ──────────────────────────────────────
  {
    id: "apl-056", name: "Anneke Vos", location: "Coeur d'Alene, Idaho",
    roleId: ROLE_GUEST_SERVICES, stage: "accepted", matchScore: 95,
    appliedOn: "Jun 10", appliedDaysAgo: 48,
    availability: "May 4 – Sep 27", experience: "Four seasons of hotel front desk, two as lead",
    certifications: ["First aid"], needsHousing: false,
    note: "Accepted in June; already on the desk.",
  },
  {
    id: "apl-057", name: "Julian Sato", location: "Seattle, Washington",
    roleId: ROLE_GUEST_SERVICES, stage: "offer", matchScore: 89,
    appliedOn: "Jul 7", appliedDaysAgo: 21,
    availability: "May 4 – Sep 27", experience: "Boutique hotel reception, three years",
    certifications: [], needsHousing: true,
    note: "Offer out; role closes in six days.",
  },
  {
    id: "apl-058", name: "Bianca Rossi", location: "Portland, Oregon",
    roleId: ROLE_GUEST_SERVICES, stage: "interview", matchScore: 86,
    appliedOn: "Jul 13", appliedDaysAgo: 15,
    availability: "May 4 – Sep 27", experience: "Resort reservations, two seasons",
    certifications: [], needsHousing: true,
    note: "Interview booked for the August 3 block.",
  },
  {
    id: "apl-059", name: "Tomas Herrera", location: "Boise, Idaho",
    roleId: ROLE_GUEST_SERVICES, stage: "interview", matchScore: 83,
    appliedOn: "Jul 15", appliedDaysAgo: 13,
    availability: "May 4 – Sep 27", experience: "Restaurant host and reservations",
    certifications: ["Food handler"], needsHousing: true,
    note: "Interview booked.",
  },
  {
    id: "apl-060", name: "Leila Karam", location: "Spokane, Washington",
    roleId: ROLE_GUEST_SERVICES, stage: "saved", matchScore: 81,
    appliedOn: "Jul 17", appliedDaysAgo: 11,
    availability: "May 4 – Sep 27", experience: "Call centre team lead",
    certifications: [], needsHousing: false,
    note: "Saved; local and immediately available.",
  },
  {
    id: "apl-061", name: "Emmett Doyle", location: "Missoula, Montana",
    roleId: ROLE_GUEST_SERVICES, stage: "saved", matchScore: 77,
    appliedOn: "Jul 18", appliedDaysAgo: 10,
    availability: "May 18 – Sep 27", experience: "Hostel night desk, one season",
    certifications: [], needsHousing: true,
    note: "Saved; two-week late start.",
  },
  {
    id: "apl-062", name: "Priya Balan", location: "Denver, Colorado",
    roleId: ROLE_GUEST_SERVICES, stage: "reviewing", matchScore: 79,
    appliedOn: "Jul 21", appliedDaysAgo: 7,
    availability: "May 4 – Sep 27", experience: "Museum visitor services",
    certifications: [], needsHousing: true,
    note: "Under review; role closes in six days.",
  },
  {
    id: "apl-063", name: "Hollis Grant", location: "Salt Lake City, Utah",
    roleId: ROLE_GUEST_SERVICES, stage: "reviewing", matchScore: 73,
    appliedOn: "Jul 22", appliedDaysAgo: 6,
    availability: "Jun 1 – Sep 27", experience: "Ski resort ticketing",
    certifications: [], needsHousing: true,
    note: "Under review.",
  },
  {
    id: "apl-064", name: "Maren Dahl", location: "Fargo, North Dakota",
    roleId: ROLE_GUEST_SERVICES, stage: "reviewing", matchScore: 70,
    appliedOn: "Jul 23", appliedDaysAgo: 5,
    availability: "May 4 – Sep 27", experience: "Bank teller",
    certifications: [], needsHousing: true,
    note: "Under review.",
  },
  {
    id: "apl-065", name: "Xavier Boone", location: "Sandpoint, Idaho",
    roleId: ROLE_GUEST_SERVICES, stage: "new", matchScore: 84,
    appliedOn: "Jul 27", appliedDaysAgo: 1,
    availability: "May 4 – Sep 27", experience: "Lodge front desk, two seasons",
    certifications: ["First aid"], needsHousing: false,
    note: "Applied yesterday; local and experienced.",
  },
  {
    id: "apl-066", name: "Rosalind Teague", location: "Kalispell, Montana",
    roleId: ROLE_GUEST_SERVICES, stage: "new", matchScore: 72,
    appliedOn: "Jul 26", appliedDaysAgo: 2,
    availability: "May 4 – Sep 27", experience: "Retail supervisor",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-067", name: "Dmitri Volkov", location: "Chicago, Illinois",
    roleId: ROLE_GUEST_SERVICES, stage: "new", matchScore: 68,
    appliedOn: "Jul 26", appliedDaysAgo: 2,
    availability: "Jun 15 – Sep 27", experience: "Event box office",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-068", name: "Cleo Barnaby", location: "Austin, Texas",
    roleId: ROLE_GUEST_SERVICES, stage: "new", matchScore: 64,
    appliedOn: "Jul 25", appliedDaysAgo: 3,
    availability: "May 4 – Aug 30", experience: "Coffee shop shift lead",
    certifications: ["Food handler"], needsHousing: true,
    note: "Leaves four weeks early.",
  },
  {
    id: "apl-069", name: "Nils Bergstrom", location: "Duluth, Minnesota",
    roleId: ROLE_GUEST_SERVICES, stage: "not_selected", matchScore: 59,
    appliedOn: "Jun 21", appliedDaysAgo: 37,
    availability: "Aug 10 – Sep 27", experience: "Grocery clerk",
    certifications: [], needsHousing: true,
    note: "Available for the final seven weeks only.",
  },
  {
    id: "apl-070", name: "Adaeze Umeh", location: "Houston, Texas",
    roleId: ROLE_GUEST_SERVICES, stage: "not_selected", matchScore: 62,
    appliedOn: "Jun 25", appliedDaysAgo: 33,
    availability: "May 4 – Sep 27", experience: "Administrative assistant",
    certifications: [], needsHousing: true,
    note: "Withdrew from the interview block, then declined a later slot.",
  },
  {
    id: "apl-071", name: "Corin Vale", location: "Portland, Maine",
    roleId: ROLE_GUEST_SERVICES, stage: "not_selected", matchScore: 66,
    appliedOn: "Jun 27", appliedDaysAgo: 31,
    availability: "May 4 – Sep 27", experience: "Inn keeper's assistant, one season",
    certifications: [], needsHousing: true,
    note: "Took a year-round role before the offer went out.",
  },
  {
    id: "apl-072", name: "Yasmin Haque", location: "Vancouver, British Columbia",
    roleId: ROLE_GUEST_SERVICES, stage: "withdrawn", matchScore: 75,
    appliedOn: "Jul 1", appliedDaysAgo: 27,
    availability: "May 4 – Sep 27", experience: "Hotel guest relations, two years",
    certifications: [], needsHousing: true,
    note: "Withdrew — work authorisation timing.",
  },

  // ── Trail & Grounds Crew (14) ────────────────────────────────────────────
  {
    id: "apl-073", name: "Silas Renner", location: "Missoula, Montana",
    roleId: ROLE_TRAIL_GROUNDS, stage: "accepted", matchScore: 92,
    appliedOn: "Jun 14", appliedDaysAgo: 44,
    availability: "May 4 – Sep 20", experience: "Forest Service trail crew, three seasons",
    certifications: ["Chainsaw", "Wilderness First Aid"], needsHousing: true,
    note: "Accepted in June; running the cutting block.",
  },
  {
    id: "apl-074", name: "Thandiwe Mbeki", location: "Boise, Idaho",
    roleId: ROLE_TRAIL_GROUNDS, stage: "offer", matchScore: 87,
    appliedOn: "Jul 9", appliedDaysAgo: 19,
    availability: "May 4 – Sep 20", experience: "Conservation corps, two seasons",
    certifications: ["Chainsaw", "First aid"], needsHousing: true,
    note: "Offer out this week.",
  },
  {
    id: "apl-075", name: "Ronan Keeley", location: "Spokane, Washington",
    roleId: ROLE_TRAIL_GROUNDS, stage: "interview", matchScore: 82,
    appliedOn: "Jul 14", appliedDaysAgo: 14,
    availability: "May 4 – Sep 20", experience: "Landscaping crew lead, four years",
    certifications: ["Chainsaw"], needsHousing: true,
    note: "Interview booked for the August 3 block.",
  },
  {
    id: "apl-076", name: "Isolde Marchand", location: "Bend, Oregon",
    roleId: ROLE_TRAIL_GROUNDS, stage: "saved", matchScore: 80,
    appliedOn: "Jul 16", appliedDaysAgo: 12,
    availability: "May 4 – Sep 20", experience: "Mountain bike trail building, two seasons",
    certifications: ["First aid"], needsHousing: true,
    note: "Saved for the second interview wave.",
  },
  {
    id: "apl-077", name: "Ezra Blackwood", location: "Sandpoint, Idaho",
    roleId: ROLE_TRAIL_GROUNDS, stage: "saved", matchScore: 74,
    appliedOn: "Jul 18", appliedDaysAgo: 10,
    availability: "May 4 – Sep 20", experience: "Arborist assistant",
    certifications: ["Chainsaw"], needsHousing: false,
    note: "Local; saved.",
  },
  {
    id: "apl-078", name: "Marta Kaminski", location: "Salt Lake City, Utah",
    roleId: ROLE_TRAIL_GROUNDS, stage: "reviewing", matchScore: 78,
    appliedOn: "Jul 21", appliedDaysAgo: 7,
    availability: "May 4 – Sep 20", experience: "Park maintenance, one season",
    certifications: [], needsHousing: true,
    note: "Under review.",
  },
  {
    id: "apl-079", name: "Bode Ackerman", location: "Cheyenne, Wyoming",
    roleId: ROLE_TRAIL_GROUNDS, stage: "reviewing", matchScore: 72,
    appliedOn: "Jul 22", appliedDaysAgo: 6,
    availability: "May 4 – Sep 20", experience: "Fencing and ranch work",
    certifications: [], needsHousing: true,
    note: "Under review.",
  },
  {
    id: "apl-080", name: "Junia Castellanos", location: "Sacramento, California",
    roleId: ROLE_TRAIL_GROUNDS, stage: "reviewing", matchScore: 69,
    appliedOn: "Jul 23", appliedDaysAgo: 5,
    availability: "Jun 1 – Sep 20", experience: "Vineyard crew",
    certifications: [], needsHousing: true,
    note: "Under review.",
  },
  {
    id: "apl-081", name: "Halvard Strand", location: "Anchorage, Alaska",
    roleId: ROLE_TRAIL_GROUNDS, stage: "new", matchScore: 83,
    appliedOn: "Jul 27", appliedDaysAgo: 1,
    availability: "May 4 – Sep 20", experience: "Backcountry trail crew, two seasons",
    certifications: ["Chainsaw", "Wilderness First Responder"], needsHousing: true,
    note: "Applied yesterday.",
  },
  {
    id: "apl-082", name: "Winnie Osei", location: "Minneapolis, Minnesota",
    roleId: ROLE_TRAIL_GROUNDS, stage: "new", matchScore: 71,
    appliedOn: "Jul 26", appliedDaysAgo: 2,
    availability: "May 4 – Sep 20", experience: "City parks summer crew",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-083", name: "Rafe Donnelly", location: "Reno, Nevada",
    roleId: ROLE_TRAIL_GROUNDS, stage: "new", matchScore: 66,
    appliedOn: "Jul 25", appliedDaysAgo: 3,
    availability: "Jun 15 – Sep 20", experience: "Construction labourer",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-084", name: "Solveig Braun", location: "Fargo, North Dakota",
    roleId: ROLE_TRAIL_GROUNDS, stage: "not_selected", matchScore: 56,
    appliedOn: "Jun 23", appliedDaysAgo: 35,
    availability: "Jul 27 – Sep 20", experience: "Warehouse",
    certifications: [], needsHousing: true,
    note: "Eight weeks of a twenty-week season.",
  },
  {
    id: "apl-085", name: "Emeka Nnaji", location: "Cleveland, Ohio",
    roleId: ROLE_TRAIL_GROUNDS, stage: "not_selected", matchScore: 61,
    appliedOn: "Jun 30", appliedDaysAgo: 28,
    availability: "May 4 – Sep 20", experience: "Delivery driver",
    certifications: [], needsHousing: true,
    note: "Withdrew from the physical requirements after the call.",
  },
  {
    id: "apl-086", name: "Perrin Ashby", location: "Eugene, Oregon",
    roleId: ROLE_TRAIL_GROUNDS, stage: "withdrawn", matchScore: 74,
    appliedOn: "Jul 4", appliedDaysAgo: 24,
    availability: "May 4 – Sep 20", experience: "Trail crew, one season",
    certifications: ["Chainsaw"], needsHousing: true,
    note: "Withdrew — accepted a Forest Service contract.",
  },

  // ── Evening Kitchen Team (10) ────────────────────────────────────────────
  {
    id: "apl-087", name: "Nour Salib", location: "Spokane, Washington",
    roleId: ROLE_EVENING_KITCHEN, stage: "interview", matchScore: 88,
    appliedOn: "Jul 15", appliedDaysAgo: 13,
    availability: "Jun 1 – Sep 20", experience: "Line cook, three years",
    certifications: ["Food handler"], needsHousing: true,
    note: "Interview booked for the August 3 block.",
  },
  {
    id: "apl-088", name: "Georgia Pike", location: "Coeur d'Alene, Idaho",
    roleId: ROLE_EVENING_KITCHEN, stage: "saved", matchScore: 79,
    appliedOn: "Jul 17", appliedDaysAgo: 11,
    availability: "Jun 1 – Sep 20", experience: "Prep cook, one season",
    certifications: ["Food handler"], needsHousing: false,
    note: "Local; saved.",
  },
  {
    id: "apl-089", name: "Idris Farah", location: "Seattle, Washington",
    roleId: ROLE_EVENING_KITCHEN, stage: "reviewing", matchScore: 74,
    appliedOn: "Jul 21", appliedDaysAgo: 7,
    availability: "Jun 1 – Sep 20", experience: "Catering kitchen, two years",
    certifications: ["Food handler"], needsHousing: true,
    note: "Under review.",
  },
  {
    id: "apl-090", name: "Bette Kowalczyk", location: "Boise, Idaho",
    roleId: ROLE_EVENING_KITCHEN, stage: "reviewing", matchScore: 70,
    appliedOn: "Jul 23", appliedDaysAgo: 5,
    availability: "Jun 8 – Sep 20", experience: "Diner cook",
    certifications: [], needsHousing: true,
    note: "Under review.",
  },
  {
    id: "apl-091", name: "Otto Lindgren", location: "Missoula, Montana",
    roleId: ROLE_EVENING_KITCHEN, stage: "new", matchScore: 68,
    appliedOn: "Jul 26", appliedDaysAgo: 2,
    availability: "Jun 1 – Sep 20", experience: "Dishwasher moving to prep",
    certifications: [], needsHousing: true,
    note: "New this week.",
  },
  {
    id: "apl-092", name: "Delphine Roux", location: "Portland, Oregon",
    roleId: ROLE_EVENING_KITCHEN, stage: "not_selected", matchScore: 60,
    appliedOn: "Jun 28", appliedDaysAgo: 30,
    availability: "Aug 3 – Sep 20", experience: "Bakery counter",
    certifications: [], needsHousing: true,
    note: "Seven weeks of a sixteen-week posting.",
  },
  {
    id: "apl-093", name: "Kwame Boateng", location: "Chicago, Illinois",
    roleId: ROLE_EVENING_KITCHEN, stage: "not_selected", matchScore: 63,
    appliedOn: "Jul 2", appliedDaysAgo: 26,
    availability: "Jun 1 – Sep 20", experience: "Fast casual kitchen",
    certifications: [], needsHousing: true,
    note: "Declined the evening schedule after the call.",
  },
  {
    id: "apl-094", name: "Signe Aalto", location: "Duluth, Minnesota",
    roleId: ROLE_EVENING_KITCHEN, stage: "withdrawn", matchScore: 74,
    appliedOn: "Jul 5", appliedDaysAgo: 23,
    availability: "Jun 1 – Sep 20", experience: "Restaurant sous chef, two years",
    certifications: ["Food handler"], needsHousing: true,
    note: "Withdrew — took a head cook role elsewhere.",
  },
  {
    id: "apl-095", name: "Tariq Bashir", location: "Denver, Colorado",
    roleId: ROLE_EVENING_KITCHEN, stage: "withdrawn", matchScore: 71,
    appliedOn: "Jul 8", appliedDaysAgo: 20,
    availability: "Jun 1 – Sep 20", experience: "Hotel banquet kitchen",
    certifications: ["Food handler"], needsHousing: true,
    note: "Withdrew — housing timing did not work.",
  },
  {
    id: "apl-096", name: "Maeve Sullivan", location: "Sandpoint, Idaho",
    roleId: ROLE_EVENING_KITCHEN, stage: "withdrawn", matchScore: 64,
    appliedOn: "Jul 11", appliedDaysAgo: 17,
    availability: "Jun 1 – Sep 20", experience: "Cafe cook",
    certifications: [], needsHousing: false,
    note: "Withdrew — found local year-round work.",
  },
];

/**
 * The 96 individual applications. Every applicant count anywhere in this
 * workspace is a fold over THIS array — there is no stored total to disagree
 * with it, and no per-stage constant sitting beside it.
 */
export const DEMO_APPLICANTS: readonly DemoApplicant[] = APPLICANT_SEEDS.map(
  (seed) => ({
    ...seed,
    initials: initialsOf(seed.name),
    demoLabel: DEMO_DATA_LABEL,
  }),
);

const APPLICANT_BY_ID: ReadonlyMap<string, DemoApplicant> = new Map(
  DEMO_APPLICANTS.map((applicant) => [applicant.id, applicant]),
);

export function demoApplicant(id: string): DemoApplicant | undefined {
  return APPLICANT_BY_ID.get(id);
}

// ─── Outreach ──────────────────────────────────────────────────────────────

export interface DemoCampaign {
  readonly id: string;
  readonly name: string;
  readonly roleId: string;
  readonly audience: string;
  readonly startedOn: string;
  readonly status: "running" | "complete";
  readonly invitesSent: number;
  readonly invitesAccepted: number;
  /** Invites from this campaign that fell inside the current billing period. */
  readonly sentThisPeriod: number;
  readonly note: string;
  readonly demoLabel: DemoLabel;
}

export const DEMO_CAMPAIGNS: readonly DemoCampaign[] = [
  {
    id: "demo_camp_returning_crew",
    name: "Returning lake crew",
    roleId: ROLE_LAKESIDE,
    audience: "Seekers who worked a lakeside season in the last two years",
    startedOn: "May 18, 2026",
    status: "running",
    invitesSent: 12,
    invitesAccepted: 7,
    sentThisPeriod: 4,
    note: "Highest acceptance of the five — people who have done the work already know what the housing means.",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_camp_paddle_certified",
    name: "Paddle-certified, Pacific Northwest",
    roleId: ROLE_DOCK_PADDLE,
    audience: "Seekers with a paddle or swiftwater certification within 400 miles",
    startedOn: "Jun 1, 2026",
    status: "running",
    invitesSent: 8,
    invitesAccepted: 5,
    sentThisPeriod: 3,
    note: "Certification filter is doing the work — half the accepts came in the first week.",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_camp_front_desk",
    name: "Front-desk experience, shoulder season",
    roleId: ROLE_GUEST_SERVICES,
    audience: "Seekers with hospitality reception experience and May availability",
    startedOn: "Jun 8, 2026",
    status: "running",
    invitesSent: 6,
    invitesAccepted: 3,
    sentThisPeriod: 3,
    note: "Half accepted. The role closes in six days, so this is the campaign to top up.",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_camp_trail_contracts",
    name: "Trail crews finishing spring contracts",
    roleId: ROLE_TRAIL_GROUNDS,
    audience: "Seekers with chainsaw certification finishing a spring contract",
    startedOn: "Jun 15, 2026",
    status: "running",
    invitesSent: 5,
    invitesAccepted: 3,
    sentThisPeriod: 2,
    note: "Small and precise. Timing the invite to a contract end is what made it land.",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_camp_kitchen_local",
    name: "Evening kitchen, local radius",
    roleId: ROLE_EVENING_KITCHEN,
    audience: "Seekers with a food handler certification within 80 miles",
    startedOn: "Jul 6, 2026",
    status: "running",
    invitesSent: 3,
    invitesAccepted: 1,
    sentThisPeriod: 2,
    note: "Weakest of the five. The evening schedule is the thing people ask about first.",
    demoLabel: DEMO_DATA_LABEL,
  },
];

// ─── Messages ──────────────────────────────────────────────────────────────

export interface DemoMessage {
  readonly id: string;
  readonly from: "host" | "applicant";
  readonly body: string;
  readonly timeLabel: string;
}

export interface DemoThread {
  readonly id: string;
  /** Joins to a REAL applicant record — never a name typed twice. */
  readonly applicantId: string;
  readonly subject: string;
  readonly unread: boolean;
  readonly lastActivityLabel: string;
  /** Hours the applicant has been waiting on a reply. Drives Needs Attention. */
  readonly waitingHours: number;
  readonly messages: readonly DemoMessage[];
  readonly demoLabel: DemoLabel;
}

export const DEMO_THREADS: readonly DemoThread[] = [
  {
    id: "demo_thread_maya",
    applicantId: "apl-001",
    subject: "About the cabin room",
    unread: true,
    lastActivityLabel: "2 hours ago",
    waitingHours: 2,
    messages: [
      {
        id: "demo_msg_maya_1",
        from: "host",
        body: "Hi Maya — an offer for the guest experience role is on its way to you. Housing is a private room in a four-bed cabin, and the two crew meals a day run seven days a week including your days off.",
        timeLabel: "Jul 26, 9:12am",
      },
      {
        id: "demo_msg_maya_2",
        from: "applicant",
        body: "Thanks for the offer. Is the cabin a private room for the whole season, or does it get shared when the property is full?",
        timeLabel: "Today, 7:40am",
      },
    ],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_thread_devin",
    applicantId: "apl-002",
    subject: "Start date and gear",
    unread: true,
    lastActivityLabel: "Yesterday",
    waitingHours: 26,
    messages: [
      {
        id: "demo_msg_devin_1",
        from: "applicant",
        body: "I can start the first week of May. Happy to take dock shifts as well as the guest side if that helps the rota.",
        timeLabel: "Jul 26, 4:05pm",
      },
      {
        id: "demo_msg_devin_2",
        from: "host",
        body: "That helps a lot. May 4 is the first day; the training block runs the first two weeks.",
        timeLabel: "Jul 26, 5:31pm",
      },
      {
        id: "demo_msg_devin_3",
        from: "applicant",
        body: "Perfect. I'll bring my own board — is there rack space at the cabins?",
        timeLabel: "Yesterday, 8:02am",
      },
    ],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_thread_priya",
    applicantId: "apl-003",
    subject: "Meals on days off",
    unread: false,
    lastActivityLabel: "Tuesday",
    waitingHours: 0,
    messages: [
      {
        id: "demo_msg_priya_1",
        from: "applicant",
        body: "Are the two meals a day available on days off as well, or only on shift days?",
        timeLabel: "Jul 21, 11:20am",
      },
      {
        id: "demo_msg_priya_2",
        from: "host",
        body: "Seven days a week, days off included. The kitchen keeps a vegetarian line at every service.",
        timeLabel: "Jul 21, 12:02pm",
      },
      {
        id: "demo_msg_priya_3",
        from: "applicant",
        body: "That settles it, thank you. See you on the third for the interview.",
        timeLabel: "Jul 21, 12:15pm",
      },
    ],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_thread_simone",
    applicantId: "apl-036",
    subject: "Winter board storage",
    unread: true,
    lastActivityLabel: "3 days ago",
    waitingHours: 74,
    messages: [
      {
        id: "demo_msg_simone_1",
        from: "host",
        body: "Offer sent for the dock and paddle crew. Shared room in the cabin nearest the dock, meals on the same terms as every other role.",
        timeLabel: "Jul 23, 2:40pm",
      },
      {
        id: "demo_msg_simone_2",
        from: "applicant",
        body: "Thank you. Is there anywhere on the property to leave a board over the winter, or should I plan to take everything with me in September?",
        timeLabel: "Jul 25, 10:10am",
      },
    ],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_thread_anneke",
    applicantId: "apl-056",
    subject: "Desk rota for August",
    unread: false,
    lastActivityLabel: "Monday",
    waitingHours: 0,
    messages: [
      {
        id: "demo_msg_anneke_1",
        from: "host",
        body: "August rota is up. You are on openings Tuesday to Saturday, with the late close on Thursday.",
        timeLabel: "Jul 20, 8:30am",
      },
      {
        id: "demo_msg_anneke_2",
        from: "applicant",
        body: "Got it. I'll cover the Thursday close for the whole month if it makes the rota easier.",
        timeLabel: "Jul 20, 9:14am",
      },
    ],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_thread_silas",
    applicantId: "apl-073",
    subject: "Chainsaw course dates",
    unread: false,
    lastActivityLabel: "Last week",
    waitingHours: 0,
    messages: [
      {
        id: "demo_msg_silas_1",
        from: "applicant",
        body: "Two of the new trail crew still need the certification. Can we get the course booked before the August cutting block?",
        timeLabel: "Jul 17, 3:55pm",
      },
      {
        id: "demo_msg_silas_2",
        from: "host",
        body: "Booked for the week of August 10. Both of them are on the list.",
        timeLabel: "Jul 18, 8:05am",
      },
    ],
    demoLabel: DEMO_DATA_LABEL,
  },
];

// ─── Announcements ─────────────────────────────────────────────────────────

export type DemoAnnouncementStatus = "draft" | "scheduled" | "published";

export interface DemoAnnouncementEngagement {
  readonly views: number;
  readonly saves: number;
  readonly opens: number;
  /** Applications attributed to the run. Zero is a real answer, not a gap. */
  readonly applications: number;
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
  /** Whether the run draws on the CURRENT billing period's allowance. */
  readonly inCurrentPeriod: boolean;
  /** Only a PUBLISHED announcement has engagement. Never invented for the rest. */
  readonly engagement: DemoAnnouncementEngagement | null;
  readonly demoLabel: DemoLabel;
}

export const DEMO_ANNOUNCEMENTS: readonly DemoAnnouncement[] = [
  {
    id: "demo_ann_season_open",
    title: "Lakeside hiring season is open",
    body: "Twenty-four seasonal roles across guest experience, dock, trail, and kitchen. Housing and two meals a day are included on every one.",
    kind: "hiring",
    status: "published",
    date: "Jun 1, 2026",
    dateLabel: "Published",
    audience: "All seekers",
    inCurrentPeriod: false,
    engagement: { views: 4120, saves: 96, opens: 311, applications: 28 },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_ann_housing_update",
    title: "Staff housing update: new lakeside cabins",
    body: "Four new staff cabins open this season, which means private rooms for the whole guest-experience crew instead of shared bunks.",
    kind: "general",
    status: "published",
    date: "Jul 6, 2026",
    dateLabel: "Published",
    audience: "Seekers who saved a role",
    inCurrentPeriod: true,
    engagement: { views: 2480, saves: 64, opens: 158, applications: 11 },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_ann_new_role",
    title: "New role: Evening kitchen team",
    body: "Added a fourth kitchen role for the peak weeks. Same housing, same meals, evening hours with mornings free.",
    kind: "hiring",
    status: "published",
    date: "Jul 13, 2026",
    dateLabel: "Published",
    audience: "All seekers",
    inCurrentPeriod: true,
    engagement: { views: 1905, saves: 51, opens: 140, applications: 9 },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_ann_deadline",
    title: "Guest services closes August 3",
    body: "The Guest Services Coordinator role closes on August 3. Anything already in review stays in review.",
    kind: "general",
    status: "scheduled",
    date: "Jul 30, 2026",
    dateLabel: "Scheduled for",
    audience: "Seekers matched to open roles",
    inCurrentPeriod: true,
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
    inCurrentPeriod: false,
    engagement: null,
    demoLabel: DEMO_DATA_LABEL,
  },
];

/** The published announcement the performance view opens on. */
export const DEMO_ANNOUNCEMENT_WITH_PERFORMANCE = "demo_ann_season_open";

// ─── Account people ────────────────────────────────────────────────────────

/**
 * The people on the account.
 *
 * HONESTY NOTE, and the reason this surface reads the way it does: accepting an
 * invitation currently grants a colleague NO access — no policy admits a
 * membership row to a listing, an application, a conversation or an analytics
 * figure — so PLAN_ENTITLEMENTS carries zero colleague seats on every tier. The
 * demo therefore shows the invitation records the product can really store, and
 * states the access position in plain words instead of implying a working
 * collaboration feature. Nothing here is sold.
 */
export interface DemoAccountPerson {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly jobTitle: string;
  readonly kind: "owner" | "invited";
  readonly invitationState: "owner" | "accepted" | "pending";
  readonly invitedOn: string | null;
  readonly accessNote: string;
  readonly demoLabel: DemoLabel;
}

type AccountPersonSeed = Omit<DemoAccountPerson, "initials" | "demoLabel">;

const ACCOUNT_PEOPLE_SEEDS: readonly AccountPersonSeed[] = [
  {
    id: "demo_person_owner",
    name: "Rowan Ellery",
    jobTitle: "Operations director — account owner",
    kind: "owner",
    invitationState: "owner",
    invitedOn: null,
    accessNote:
      "Full access to every surface in this workspace. The owner is the only account that can publish, message, or spend credits.",
  },
  {
    id: "demo_person_desk",
    name: "Anneke Vos",
    jobTitle: "Guest services lead",
    kind: "invited",
    invitationState: "accepted",
    invitedOn: "Jun 12, 2026",
    accessNote:
      "Invitation accepted and recorded. Colleague access is not granted yet — signing in shows what a signed-out visitor sees.",
  },
  {
    id: "demo_person_water",
    name: "Kai Fontaine",
    jobTitle: "Waterfront lead",
    kind: "invited",
    invitationState: "accepted",
    invitedOn: "Jun 12, 2026",
    accessNote:
      "Invitation accepted and recorded. Colleague access is not granted yet — signing in shows what a signed-out visitor sees.",
  },
  {
    id: "demo_person_trail",
    name: "Silas Renner",
    jobTitle: "Trail and grounds lead",
    kind: "invited",
    invitationState: "pending",
    invitedOn: "Jul 20, 2026",
    accessNote:
      "Invitation sent, not yet accepted. Accepting records the membership; it does not open the workspace.",
  },
];

export const DEMO_ACCOUNT_PEOPLE: readonly DemoAccountPerson[] =
  ACCOUNT_PEOPLE_SEEDS.map((seed) => ({
    ...seed,
    initials: initialsOf(seed.name),
    demoLabel: DEMO_DATA_LABEL,
  }));

// ─── Weekly counters (the account-wide stored series) ──────────────────────

export interface DemoWeek {
  readonly label: string;
  readonly opportunityViews: number;
  readonly profileViews: number;
  readonly saves: number;
  readonly applications: number;
  readonly qualifiedMatches: number;
  readonly invitesSent: number;
  readonly invitesAccepted: number;
}

/**
 * Ten weeks of the season, as counters.
 *
 * These are the ONLY account-wide totals stored anywhere in this module: the
 * headline tiles fold this array, and the per-role breakdown below must agree
 * with the fold (tests/unit/demo-derivations.test.ts checks both directions).
 */
export const DEMO_WEEKS: readonly DemoWeek[] = [
  { label: "May 11", opportunityViews: 145, profileViews: 92, saves: 8, applications: 3, qualifiedMatches: 1, invitesSent: 2, invitesAccepted: 1 },
  { label: "May 18", opportunityViews: 210, profileViews: 118, saves: 12, applications: 5, qualifiedMatches: 2, invitesSent: 3, invitesAccepted: 2 },
  { label: "May 25", opportunityViews: 268, profileViews: 140, saves: 16, applications: 7, qualifiedMatches: 3, invitesSent: 3, invitesAccepted: 1 },
  { label: "Jun 1", opportunityViews: 305, profileViews: 158, saves: 18, applications: 8, qualifiedMatches: 4, invitesSent: 4, invitesAccepted: 2 },
  { label: "Jun 8", opportunityViews: 352, profileViews: 176, saves: 21, applications: 9, qualifiedMatches: 4, invitesSent: 3, invitesAccepted: 2 },
  { label: "Jun 15", opportunityViews: 398, profileViews: 194, saves: 23, applications: 11, qualifiedMatches: 5, invitesSent: 4, invitesAccepted: 2 },
  { label: "Jun 22", opportunityViews: 431, profileViews: 212, saves: 25, applications: 12, qualifiedMatches: 5, invitesSent: 4, invitesAccepted: 3 },
  { label: "Jun 29", opportunityViews: 466, profileViews: 228, saves: 27, applications: 13, qualifiedMatches: 5, invitesSent: 3, invitesAccepted: 2 },
  { label: "Jul 6", opportunityViews: 505, profileViews: 250, saves: 30, applications: 14, qualifiedMatches: 6, invitesSent: 4, invitesAccepted: 2 },
  { label: "Jul 13", opportunityViews: 530, profileViews: 274, saves: 34, applications: 14, qualifiedMatches: 6, invitesSent: 4, invitesAccepted: 2 },
];

// ─── Discovery split (stored as counts, shares derived) ────────────────────

export interface DemoDiscoverySourceInput {
  readonly id: "seek" | "swipe" | "map";
  readonly label: string;
  readonly href: string;
  readonly views: number;
  readonly note: string;
}

const DISCOVERY_SOURCE_INPUTS: readonly DemoDiscoverySourceInput[] = [
  {
    id: "seek",
    label: "Seek",
    href: "/seek",
    views: 1661,
    note: "Filtered browsing — housing, meals, pay, lane, and dates.",
  },
  {
    id: "swipe",
    label: "Swipe",
    href: "/swipe",
    views: 1191,
    note: "One card at a time; a save is a strong signal.",
  },
  {
    id: "map",
    label: "Map",
    href: "/map",
    views: 758,
    note: "Place-first discovery for seekers who pick a region before a role.",
  },
];

// ═══ DERIVATIONS ═══════════════════════════════════════════════════════════
//
// Everything below is a FUNCTION over the records above. Nothing below stores
// a number. If a surface wants an aggregate it calls one of these.

/** Applications for one role. */
export function applicantsForRole(
  roleId: string,
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): readonly DemoApplicant[] {
  return applicants.filter((applicant) => applicant.roleId === roleId);
}

/**
 * Apply session-local stage moves to the canon records.
 *
 * Pure, and exported, so "Reset restores canon" is testable without mounting a
 * component: reset is defined as calling this with an empty override map, and
 * the test asserts the result is identical to canon. Keeping the rule here
 * rather than inside the provider is what makes that assertion meaningful — the
 * provider only supplies the map.
 */
export function applyStageOverrides(
  overrides: Readonly<Record<string, DemoStage>>,
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): readonly DemoApplicant[] {
  return applicants.map((applicant) => {
    const stage = overrides[applicant.id];
    return stage && stage !== applicant.stage ? { ...applicant, stage } : applicant;
  });
}

/** Stage tally over any applicant list, with every stage present (zeros too). */
export function tallyByStage(
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): Readonly<Record<DemoStage, number>> {
  const tally = Object.fromEntries(
    DEMO_STAGE_ORDER.map((stage) => [stage, 0]),
  ) as Record<DemoStage, number>;
  for (const applicant of applicants) tally[applicant.stage] += 1;
  return tally;
}

/** How many applications are at or above the qualified-match threshold. */
export function qualifiedMatchCount(
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): number {
  return applicants.filter(
    (applicant) => applicant.matchScore >= QUALIFIED_MATCH_THRESHOLD,
  ).length;
}

/** Total applications — the length of the record list, never a constant. */
export function totalApplications(
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): number {
  return applicants.length;
}

/** Opportunity views, folded from the weekly counters. */
export function totalOpportunityViews(): number {
  return sum(DEMO_WEEKS.map((week) => week.opportunityViews));
}

export function totalProfileViews(): number {
  return sum(DEMO_WEEKS.map((week) => week.profileViews));
}

export function totalSaves(): number {
  return sum(DEMO_WEEKS.map((week) => week.saves));
}

export interface DemoOutreachTotals {
  readonly sent: number;
  readonly accepted: number;
  readonly acceptanceRate: number;
  readonly sentThisPeriod: number;
}

/** Outreach totals folded from the campaign records. */
export function outreachTotals(
  campaigns: readonly DemoCampaign[] = DEMO_CAMPAIGNS,
): DemoOutreachTotals {
  const sent = sum(campaigns.map((campaign) => campaign.invitesSent));
  const accepted = sum(campaigns.map((campaign) => campaign.invitesAccepted));
  return {
    sent,
    accepted,
    acceptanceRate: sent === 0 ? 0 : accepted / sent,
    sentThisPeriod: sum(campaigns.map((campaign) => campaign.sentThisPeriod)),
  };
}

/** Announcement runs drawing on the CURRENT billing period's allowance. */
export function announcementsThisPeriod(
  announcements: readonly DemoAnnouncement[] = DEMO_ANNOUNCEMENTS,
): number {
  return announcements.filter(
    (announcement) =>
      announcement.inCurrentPeriod && announcement.status !== "draft",
  ).length;
}

/** Unread threads — the number the communications panel and nav badge show. */
export function unreadThreadCount(
  threads: readonly DemoThread[] = DEMO_THREADS,
): number {
  return threads.filter((thread) => thread.unread).length;
}

/**
 * Stored-status tally for a set of applications.
 *
 * Folds "interview" into "reviewing" per STORED_STATUS_FOR_STAGE — an interview
 * is a booked event against an application still in review, and the stored
 * enum has no separate value for it. Every surface that renders this says so.
 */
export function tallyByStoredStatus(
  applicants: readonly DemoApplicant[],
): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const applicant of applicants) {
    const status = STORED_STATUS_FOR_STAGE[applicant.stage];
    tally[status] = (tally[status] ?? 0) + 1;
  }
  return tally;
}

/**
 * A HostAnalytics object built entirely from the records above, so the REAL
 * HostAnalyticsDashboard can render the demo with no demo-specific branch.
 */
export function deriveHostAnalytics(
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): HostAnalytics {
  const perListingStats: HostPerListingStats[] = DEMO_LIVE_ROLES.map((role) => {
    const forRole = applicantsForRole(role.id, applicants);
    return {
      listingId: role.id,
      listingTitle: role.title,
      listingStatus: role.status,
      applicationsByStatus: tallyByStoredStatus(forRole),
      totalApplications: forRole.length,
      invitesSent: role.invitesSent,
      invitesAccepted: role.invitesAccepted,
    };
  });

  const invitesSent = sum(perListingStats.map((stat) => stat.invitesSent));
  const invitesAccepted = sum(
    perListingStats.map((stat) => stat.invitesAccepted),
  );

  return {
    totalApplicationsByStatus: tallyByStoredStatus(applicants),
    activeListingCount: DEMO_LIVE_ROLES.length,
    listingCount: DEMO_ROLES.length,
    inviteAcceptanceRate: invitesSent === 0 ? 0 : invitesAccepted / invitesSent,
    perListingStats,
    // The demo plan's REAL analytics entitlement — the demo shows the depth the
    // plan grants, never a depth invented for the demo.
    analyticsScope: PLAN_ENTITLEMENTS[DEMO_ORG.planTier].analytics,
  };
}

export interface DemoSourceSplit {
  readonly id: "seek" | "swipe" | "map";
  readonly label: string;
  readonly href: string;
  readonly views: number;
  /** Whole-percent share. Largest-remainder allocated so the column sums to 100. */
  readonly sharePercent: number;
  readonly share: string;
  readonly note: string;
  readonly demoLabel: DemoLabel;
}

/**
 * Discovery split with shares DERIVED from the counts.
 *
 * Largest-remainder allocation rather than independent rounding: three
 * independently rounded percentages can sum to 99 or 101, and a breakdown that
 * does not add to a whole is the exact thing that makes a reader stop trusting
 * the page.
 */
export function deriveDiscoverySources(
  inputs: readonly DemoDiscoverySourceInput[] = DISCOVERY_SOURCE_INPUTS,
): readonly DemoSourceSplit[] {
  const total = sum(inputs.map((input) => input.views));
  if (total === 0) {
    return inputs.map((input) => ({
      ...input,
      sharePercent: 0,
      share: "0%",
      demoLabel: DEMO_ANALYTICS_LABEL,
    }));
  }

  const exact = inputs.map((input) => (input.views / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  const shares = [...floors];
  for (const entry of order) {
    if (remaining <= 0) break;
    shares[entry.index] += 1;
    remaining -= 1;
  }

  return inputs.map((input, index) => ({
    ...input,
    sharePercent: shares[index],
    share: `${shares[index]}%`,
    demoLabel: DEMO_ANALYTICS_LABEL,
  }));
}

export interface DemoFunnelStage {
  readonly id: DemoStage;
  readonly label: string;
  readonly count: number;
  readonly demoLabel: DemoLabel;
}

/** The pipeline funnel, in stage order, derived from the records. */
export function deriveFunnel(
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): readonly DemoFunnelStage[] {
  const tally = tallyByStage(applicants);
  return DEMO_STAGE_ORDER.map((stage) => ({
    id: stage,
    label: DEMO_STAGE_LABEL[stage],
    count: tally[stage],
    demoLabel: DEMO_ANALYTICS_LABEL,
  }));
}

export interface DemoMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly trend: string;
  readonly trendTone: "up" | "down" | "neutral";
  /** Sparkline heights, scaled from a REAL weekly series — never drawn to look nice. */
  readonly spark: readonly number[];
  readonly demoLabel: DemoLabel;
}

/** Scale a weekly series into the 0–100 heights the sparkline primitive wants. */
function toSpark(values: readonly number[]): readonly number[] {
  const max = Math.max(...values, 1);
  return values.map((value) => Math.max(4, Math.round((value / max) * 100)));
}

function formatHoursMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/** Fastest time-to-first-application across the live roles. Null if none. */
export function fastestFirstApplicationMinutes(): number | null {
  const values = DEMO_LIVE_ROLES.map(
    (role) => role.minutesToFirstApplication,
  ).filter((value): value is number => typeof value === "number");
  return values.length === 0 ? null : Math.min(...values);
}

/** Every headline tile, computed. There is no stored tile list. */
export function deriveMetrics(
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): readonly DemoMetric[] {
  const views = totalOpportunityViews();
  const applications = totalApplications(applicants);
  const outreach = outreachTotals();
  const fastest = fastestFirstApplicationMinutes();
  const viewToApplication = views === 0 ? 0 : (applications / views) * 100;

  const metrics: DemoMetric[] = [
    {
      id: "profile_views",
      label: "Profile views",
      value: totalProfileViews().toLocaleString(),
      trend: `Across ${DEMO_WEEKS.length} weeks of the season`,
      trendTone: "up",
      spark: toSpark(DEMO_WEEKS.map((week) => week.profileViews)),
      demoLabel: DEMO_PERFORMANCE_LABEL,
    },
    {
      id: "opportunity_views",
      label: "Opportunity views",
      value: views.toLocaleString(),
      trend: `Across ${DEMO_LIVE_ROLES.length} live roles`,
      trendTone: "up",
      spark: toSpark(DEMO_WEEKS.map((week) => week.opportunityViews)),
      demoLabel: DEMO_PERFORMANCE_LABEL,
    },
    {
      id: "saves",
      label: "Saves",
      value: totalSaves().toLocaleString(),
      trend: "Seekers watching",
      trendTone: "neutral",
      spark: toSpark(DEMO_WEEKS.map((week) => week.saves)),
      demoLabel: DEMO_PERFORMANCE_LABEL,
    },
    {
      id: "applications",
      label: "Applications",
      value: applications.toLocaleString(),
      trend: "Season to date",
      trendTone: "up",
      spark: toSpark(DEMO_WEEKS.map((week) => week.applications)),
      demoLabel: DEMO_PERFORMANCE_LABEL,
    },
    {
      id: "qualified_matches",
      label: "Qualified matches",
      value: qualifiedMatchCount(applicants).toLocaleString(),
      trend: `Score ${QUALIFIED_MATCH_THRESHOLD} and above`,
      trendTone: "up",
      spark: toSpark(DEMO_WEEKS.map((week) => week.qualifiedMatches)),
      demoLabel: DEMO_PERFORMANCE_LABEL,
    },
    {
      id: "view_to_application",
      label: "View to application",
      value: `${viewToApplication.toFixed(1)}%`,
      trend: `${applications.toLocaleString()} of ${views.toLocaleString()} views`,
      trendTone: "neutral",
      spark: toSpark(
        DEMO_WEEKS.map((week) =>
          week.opportunityViews === 0
            ? 0
            : Math.round((week.applications / week.opportunityViews) * 1000),
        ),
      ),
      demoLabel: DEMO_PERFORMANCE_LABEL,
    },
    {
      id: "invite_acceptance",
      label: "Invite acceptance",
      value: `${Math.round(outreach.acceptanceRate * 100)}%`,
      trend: `${outreach.accepted} of ${outreach.sent} invitations`,
      trendTone: "up",
      spark: toSpark(DEMO_WEEKS.map((week) => week.invitesAccepted)),
      demoLabel: DEMO_PERFORMANCE_LABEL,
    },
  ];

  if (fastest !== null) {
    metrics.push({
      id: "time_to_first_application",
      label: "Time to first application",
      value: formatHoursMinutes(fastest),
      trend: "Fastest live role, after publishing",
      trendTone: "up",
      spark: toSpark(
        DEMO_LIVE_ROLES.map((role) => role.minutesToFirstApplication ?? 0),
      ),
      demoLabel: DEMO_PERFORMANCE_LABEL,
    });
  }

  return metrics;
}

export interface DemoPlanUsageRow {
  readonly id: string;
  readonly label: string;
  readonly used: number;
  /**
   * The plan's included figure is NEVER written here as a literal: the surfaces
   * read the real entitlement from packages/contracts PLAN_ENTITLEMENTS and
   * compare it with `used`.
   */
  readonly entitlementKey:
    | "listings"
    | "includedInviteCredits"
    | "monthlyAnnouncements";
  readonly note: string;
  readonly demoLabel: DemoLabel;
}

/** Plan usage, with every `used` figure folded from the records. */
export function derivePlanUsage(): readonly DemoPlanUsageRow[] {
  const outreach = outreachTotals();
  return [
    {
      id: "listings",
      label: "Active listings",
      used: DEMO_LIVE_ROLES.length,
      entitlementKey: "listings",
      note: `${DEMO_DRAFT_ROLES.length} more roles sit in drafts, ready to publish.`,
      demoLabel: DEMO_ANALYTICS_LABEL,
    },
    {
      id: "invites",
      label: "Invite credits used this period",
      used: outreach.sentThisPeriod,
      entitlementKey: "includedInviteCredits",
      note: `${outreach.sent} invitations across the whole season; credit packs cover anything past the monthly allowance.`,
      demoLabel: DEMO_ANALYTICS_LABEL,
    },
    {
      id: "announcements",
      label: "Announcement runs used this period",
      used: announcementsThisPeriod(),
      entitlementKey: "monthlyAnnouncements",
      note: "At the allowance. Another run this period is a single purchase, not a plan change.",
      demoLabel: DEMO_ANALYTICS_LABEL,
    },
  ];
}

export interface DemoRolePerformance {
  readonly role: DemoRole;
  readonly applications: number;
  readonly tally: Readonly<Record<DemoStage, number>>;
  readonly qualified: number;
  readonly viewToApplication: number;
  readonly saveRate: number;
  readonly inviteAcceptance: number | null;
  /** Plain-language diagnosis, computed from THIS role's own numbers. */
  readonly diagnosis: string;
}

/**
 * Per-role performance with a diagnosis derived from the role's own figures.
 *
 * The diagnosis is a branch over measured ratios, not a sentence typed next to
 * a role. That is the difference between "the kitchen role is slow" and a
 * marketing claim: change the records and the sentence changes with them.
 */
export function deriveRolePerformance(
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): readonly DemoRolePerformance[] {
  return DEMO_LIVE_ROLES.map((role) => {
    const forRole = applicantsForRole(role.id, applicants);
    const applications = forRole.length;
    const viewToApplication =
      role.views === 0 ? 0 : (applications / role.views) * 100;
    const saveRate = role.views === 0 ? 0 : (role.saves / role.views) * 100;
    const inviteAcceptance =
      role.invitesSent === 0 ? null : role.invitesAccepted / role.invitesSent;
    const qualified = qualifiedMatchCount(forRole);

    let diagnosis: string;
    if (applications === 0) {
      diagnosis =
        "No applications yet. Views without applications usually means the pay or the dates are the blocker.";
    } else if (saveRate >= 5 && viewToApplication < 2) {
      diagnosis =
        "Plenty of saves, few applications — people like the role and stall at the commitment. Check the dates and the deadline.";
    } else if (viewToApplication >= 3) {
      diagnosis =
        "Converting well above the account average. Nothing to fix here; it is the one to copy.";
    } else if (qualified === 0) {
      diagnosis =
        "Applications are arriving but none clear the match threshold. The requirements and the audience are pulling apart.";
    } else {
      diagnosis =
        "Converting close to the account average. Steady rather than urgent.";
    }

    return {
      role,
      applications,
      tally: tallyByStage(forRole),
      qualified,
      viewToApplication,
      saveRate,
      inviteAcceptance,
      diagnosis,
    };
  });
}

export interface DemoAttentionItem {
  readonly id: string;
  readonly title: string;
  /** The record that produced this item — the evidence, never a vibe. */
  readonly evidence: string;
  readonly href: string;
  readonly tone: "urgent" | "soon" | "later";
}

/**
 * The Needs Attention queue.
 *
 * Every item is produced by a predicate over the records and carries the
 * evidence that produced it. An item with no evidence line cannot exist here,
 * which is the whole point: a command centre that tells a host to "improve
 * engagement" has told them nothing.
 */
export function deriveNeedsAttention(
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): readonly DemoAttentionItem[] {
  const items: DemoAttentionItem[] = [];

  const closingSoon = DEMO_LIVE_ROLES.filter((role) => role.closingSoon);
  for (const role of closingSoon) {
    const forRole = applicantsForRole(role.id, applicants);
    const tally = tallyByStage(forRole);
    items.push({
      id: `closing_${role.id}`,
      title: `${role.title} closes in ${role.deadlineDaysAway} days`,
      evidence: `${tally.offer} offer out, ${tally.interview} interviews booked, ${tally.new + tally.reviewing} still unresolved.`,
      href: "/for-hosts/demo/applicants",
      tone: "urgent",
    });
  }

  const waiting = DEMO_THREADS.filter(
    (thread) => thread.unread && thread.waitingHours >= 24,
  );
  if (waiting.length > 0) {
    // The stage named here is LOOKED UP from the session's applicant list, not
    // typed into the sentence: a visitor who moves that candidate would
    // otherwise leave the queue asserting something that is no longer true.
    const longest = waiting.reduce((worst, thread) =>
      thread.waitingHours > worst.waitingHours ? thread : worst,
    );
    const person = applicants.find(
      (applicant) => applicant.id === longest.applicantId,
    );
    items.push({
      id: "waiting_replies",
      title: `${waiting.length} candidates waiting on a reply`,
      evidence: person
        ? `Longest wait is ${longest.waitingHours} hours, from ${person.name}, currently at ${DEMO_STAGE_LABEL[person.stage].toLowerCase()}.`
        : `Longest wait is ${longest.waitingHours} hours.`,
      href: "/for-hosts/demo/messages",
      tone: "urgent",
    });
  }

  const interviews = applicants.filter(
    (applicant) => applicant.stage === "interview",
  );
  if (interviews.length > 0) {
    const roleCount = new Set(interviews.map((a) => a.roleId)).size;
    items.push({
      id: "interview_block",
      title: `${interviews.length} interviews booked for August 3–7`,
      evidence: `Across ${roleCount} ${roleCount === 1 ? "role" : "roles"}, twenty minutes each.`,
      href: "/for-hosts/demo/applicants",
      tone: "soon",
    });
  }

  const entitlement = PLAN_ENTITLEMENTS[DEMO_ORG.planTier];
  const used = announcementsThisPeriod();
  if (used >= entitlement.monthlyAnnouncements) {
    items.push({
      id: "announcement_allowance",
      title: "Announcement allowance is fully used this period",
      evidence: `${used} of ${entitlement.monthlyAnnouncements} runs used, with one scheduled for July 30.`,
      href: "/for-hosts/demo/announcements",
      tone: "soon",
    });
  }

  if (DEMO_DRAFT_ROLES.length > 0) {
    items.push({
      id: "drafts_unpublished",
      title: `${DEMO_DRAFT_ROLES.length} roles are still drafts`,
      evidence: `${DEMO_DRAFT_ROLES.map((role) => role.title).join(" and ")} — drafts are not discoverable and take no applications.`,
      href: "/for-hosts/demo/listings",
      tone: "later",
    });
  }

  return items;
}

export interface DemoCalendarEntry {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: "urgent" | "soon" | "later";
}

/** The season calendar, derived from role deadlines and scheduled runs. */
export function deriveCalendar(
  applicants: readonly DemoApplicant[] = DEMO_APPLICANTS,
): readonly DemoCalendarEntry[] {
  const entries: DemoCalendarEntry[] = [];

  const scheduled = DEMO_ANNOUNCEMENTS.filter(
    (announcement) => announcement.status === "scheduled",
  );
  for (const announcement of scheduled) {
    entries.push({
      id: `cal_${announcement.id}`,
      date: announcement.date ?? "",
      title: announcement.title,
      detail: `Announcement goes out to: ${announcement.audience.toLowerCase()}.`,
      tone: "soon",
    });
  }

  const interviews = applicants.filter((a) => a.stage === "interview").length;
  if (interviews > 0) {
    entries.push({
      id: "cal_interview_week",
      date: "Aug 3 – Aug 7, 2026",
      title: "Interview week",
      detail: `${interviews} candidates booked, twenty minutes each.`,
      tone: "soon",
    });
  }

  for (const role of DEMO_LIVE_ROLES) {
    if (!role.deadline) continue;
    entries.push({
      id: `cal_deadline_${role.id}`,
      date: role.deadline,
      title: `${role.title} closes`,
      detail: `${role.openPositions} positions open; ${applicantsForRole(role.id, applicants).length} applications so far.`,
      tone: role.closingSoon ? "urgent" : "later",
    });
  }

  entries.push({
    id: "cal_season_end",
    date: "Sep 20, 2026",
    title: "Season ends",
    detail: "Completion bonuses paid on the dock; references written on request.",
    tone: "later",
  });

  return entries;
}

// ─── Listing view-models for the REAL seeker components ────────────────────

/** A role as the canonical OpportunityListing the production card renders. */
export function roleToDiscoveryListing(role: DemoRole): DiscoveryListing {
  const photo = getSitePhoto(role.photoSlug);
  return {
    id: role.id,
    title: role.title,
    category: role.category,
    location: DEMO_ORG.location,
    coordinates: { lat: 47.6777, lon: -116.7805 },
    opportunityWindow: role.opportunityWindow,
    begins: role.begins,
    ends: role.ends,
    status: role.status,
    host: {
      id: DEMO_ORG.id,
      name: DEMO_ORG.name,
      verified: DEMO_ORG.verified,
      tier: DEMO_ORG.planTier,
      tagline: DEMO_ORG.tagline,
    },
    benefits: {
      housing: { provision: "provided", summary: role.housing.type },
      meals: {
        provision: "provided",
        summary:
          role.meals.costCents === 0
            ? "Two crew meals daily"
            : "Meals available at cost",
      },
      pay: {
        provision: "provided",
        // Through the formatter chokepoint, never hand-built.
        summary: formatCompensation({
          minCents: role.payMinCents,
          maxCents: role.payMaxCents,
          unit: "hour",
        }),
      },
    },
    // Local catalog rendition — an in-repo file, never a remote host.
    coverImageUrl: photo.sizes.card.src,
    conditionalBadges: role.id === ROLE_LAKESIDE ? ["boosted"] : undefined,
    matchScore: role.id === ROLE_LAKESIDE ? 91 : undefined,
    visaSupport: false,
    payInsight: {
      meterValue: Math.round((role.payMaxCents / 3000) * 100),
      minCents: role.payMinCents,
      maxCents: role.payMaxCents,
      unit: "hour",
      note: role.payNote,
    },
  };
}

/** Every live role as a discovery listing, for the seeker preview. */
export function demoLiveListings(): readonly DiscoveryListing[] {
  return DEMO_LIVE_ROLES.map(roleToDiscoveryListing);
}

// ─── Workspace navigation ──────────────────────────────────────────────────

export interface DemoSurface {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly summary: string;
  /** Rail grouping, mirroring the real host rail (D17). */
  readonly group: "primary" | "business" | "preview";
}

/** The demo workspace's own routes. Every one has a page (tested). */
export const DEMO_SURFACES: readonly DemoSurface[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/for-hosts/demo",
    summary: "The recruiting command centre a host lands in.",
    group: "primary",
  },
  {
    id: "listings",
    label: "Listings",
    href: "/for-hosts/demo/listings",
    summary: "Seven roles: five live, one closing soon, two drafts.",
    group: "primary",
  },
  {
    id: "applicants",
    label: "Applicants",
    href: "/for-hosts/demo/applicants",
    summary: "The pipeline and the list, with a candidate detail view.",
    group: "primary",
  },
  {
    id: "outreach",
    label: "Outreach",
    href: "/for-hosts/demo/outreach",
    summary: "Campaigns, credit usage, and what each one returned.",
    group: "primary",
  },
  {
    id: "messages",
    label: "Messages",
    href: "/for-hosts/demo/messages",
    summary: "Threads beside the applications they belong to.",
    group: "primary",
  },
  {
    id: "announcements",
    label: "Announcements",
    href: "/for-hosts/demo/announcements",
    summary: "Drafts, scheduled runs, and what a published one did.",
    group: "primary",
  },
  {
    id: "dashboard",
    label: "Analytics",
    href: "/for-hosts/demo/dashboard",
    summary: "Trends, funnel, sources, and a per-role comparison.",
    group: "primary",
  },
  {
    id: "profile",
    label: "Employer profile",
    href: "/for-hosts/demo/profile",
    summary: "The public page every one of your roles hangs off.",
    group: "business",
  },
  {
    id: "team",
    label: "People",
    href: "/for-hosts/demo/team",
    summary: "Who is on the account, and what access really means today.",
    group: "business",
  },
  {
    id: "plan",
    label: "Plan usage",
    href: "/for-hosts/demo/plan",
    summary: "Listings, invites and announcements against the allowance.",
    group: "business",
  },
  {
    id: "job",
    label: "Opportunity",
    href: "/for-hosts/demo/job",
    summary: "The flagship role in full, as it is written.",
    group: "preview",
  },
  {
    id: "seeker",
    label: "View as seeker",
    href: "/for-hosts/demo/seeker-view",
    summary: "Your profile and your role through the seeker's components.",
    group: "preview",
  },
];

export const DEMO_SEEKER_VIEW_HREF = "/for-hosts/demo/seeker-view";

// ─── Back-compatible snapshots ─────────────────────────────────────────────
//
// Server components render these; the applicants surface recomputes from the
// session-local list instead. They are CALLS, not parallel constants — the one
// derivation path is the only path.

export const DEMO_LISTING: DiscoveryListing = roleToDiscoveryListing(
  DEMO_FLAGSHIP_ROLE,
);
export const DEMO_ANALYTICS: HostAnalytics = deriveHostAnalytics();
export const DEMO_METRICS: readonly DemoMetric[] = deriveMetrics();
export const DEMO_DISCOVERY_SOURCES: readonly DemoSourceSplit[] =
  deriveDiscoverySources();
export const DEMO_FUNNEL_STAGES: readonly DemoFunnelStage[] = deriveFunnel();
export const DEMO_PLAN_USAGE: readonly DemoPlanUsageRow[] = derivePlanUsage();
export const DEMO_TOTAL_APPLICATIONS = totalApplications();
export const DEMO_OPPORTUNITY_VIEWS = totalOpportunityViews();
export const DEMO_PROFILE_VIEWS = totalProfileViews();
export const DEMO_SAVES = totalSaves();
export const DEMO_QUALIFIED_MATCHES = qualifiedMatchCount();
export const DEMO_OUTREACH = outreachTotals();
