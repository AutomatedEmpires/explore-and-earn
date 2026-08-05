import {
  DEFAULT_CURRENCY,
  FOUNDER_LOCKED_PRICING,
  MATCH_SCORE_WEIGHTS,
  PLAN_ENTITLEMENTS,
  matchBandFor,
  type ApplicationStatus,
  type HousingPhotoRole,
  type MatchBand,
  type MatchComponentScores,
  type MeetingType,
  type OpportunityCategory,
  type SchedulingStatus,
} from "@explore-and-earn/contracts";

/**
 * One cross-role story for the public product walkthroughs.
 *
 * The records in this module are intentionally plain, serializable values. They
 * describe a fictional account, never touch the database, and never carry a
 * provider identifier. Host and seeker routes should adapt this one graph into
 * their canonical view models instead of maintaining independent fixtures.
 */

export type DemoId = `demo_${string}`;

export const DEMO_NOW = "2026-08-05T16:00:00.000Z";
export const DEMO_DATA_LABEL = "Fictional demo data";
export const DEMO_DISCLOSURE =
  "Populated demo account. Everything here is fictional, and actions stay in this browser session.";

export const DEMO_APPLICATION_STAGES = [
  "New",
  "Reviewing",
  "Saved",
  "Offered",
  "Accepted",
  "Closed",
] as const;

export type DemoApplicationStage = (typeof DEMO_APPLICATION_STAGES)[number];

export const DEMO_APPLICATION_STATUSES = [
  "applied",
  "reviewing",
  "saved_by_host",
  "offered",
  "accepted",
  "not_selected",
] as const satisfies readonly ApplicationStatus[];

export type DemoApplicationStatus = (typeof DEMO_APPLICATION_STATUSES)[number];
export type DemoRoleStatus = "live" | "draft" | "closed";
export type DemoDecision = "skipped" | "saved" | "applied";
export type DemoMealsPhotoSlot = "kitchen" | "prepared" | "dining" | "misc";

export interface DemoPhoto {
  readonly id: DemoId;
  readonly slot: HousingPhotoRole | DemoMealsPhotoSlot | "cover" | "work" | "location";
  /** Resolved through the licensed, local site-photo catalog at render time. */
  readonly photoSlug: string;
  /** Prevents a stock scene from being presented as evidence of a real property. */
  readonly presentation: "illustrative_demo_scene";
}

export interface DemoLocation {
  readonly id: DemoId;
  readonly name: string;
  readonly locality: string;
  readonly region: string;
  readonly country: "United States";
  readonly timeZone: "America/Boise";
  readonly coordinates: { readonly lat: number; readonly lon: number };
  readonly summary: string;
  readonly remoteness: string;
  readonly transportation: readonly string[];
  readonly nearbyServices: readonly string[];
  readonly activities: readonly string[];
}

export interface DemoTeamMember {
  readonly id: DemoId;
  readonly name: string;
  readonly initials: string;
  readonly title: string;
  readonly summary: string;
  readonly publicProfile: true;
  /** Public staff profiles do not imply product-account permissions. */
  readonly workspaceAccess: "none" | "owner";
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoProfileChecklistItem {
  readonly id: DemoId;
  readonly label: string;
  readonly complete: boolean;
  readonly weight: number;
  readonly public: boolean;
}

export interface DemoHostOrganization {
  readonly id: DemoId;
  readonly name: string;
  readonly initials: string;
  readonly fictional: true;
  readonly verified: true;
  readonly category: "Seasonal lodge and outfitter";
  readonly hostSince: string;
  readonly tagline: string;
  readonly story: readonly string[];
  readonly mission: string;
  readonly culture: readonly string[];
  readonly managementApproach: string;
  readonly training: readonly string[];
  readonly seasonRhythm: readonly string[];
  readonly locationIds: readonly DemoId[];
  readonly teamMemberIds: readonly DemoId[];
  readonly coverPhoto: DemoPhoto;
  readonly gallery: readonly DemoPhoto[];
  readonly housingLibrary: readonly (DemoPhoto & { readonly slot: HousingPhotoRole })[];
  readonly faqs: readonly { readonly id: DemoId; readonly question: string; readonly answer: string }[];
  readonly profileChecklist: readonly DemoProfileChecklistItem[];
  readonly reviews: readonly [];
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoHousing {
  readonly provision: "provided";
  readonly summary: string;
  readonly type: string;
  readonly costCents: number;
  readonly costUnit: "week" | "season";
  readonly occupancy: string;
  readonly distanceFromWork: string;
  readonly availability: string;
  readonly amenities: readonly string[];
  readonly utilities: readonly string[];
  readonly rules: readonly string[];
  readonly photoSetId: DemoId;
}

export interface DemoMeals {
  readonly provision: "provided" | "partial";
  readonly summary: string;
  readonly costCents: number;
  readonly costUnit: "shift" | "week";
  readonly style: string;
  readonly included: readonly string[];
  readonly dietaryAccommodations: readonly string[];
  readonly photos: readonly (DemoPhoto & { readonly slot: DemoMealsPhotoSlot })[];
}

export interface DemoPay {
  readonly provision: "provided";
  readonly summary: string;
  readonly minimumCents: number;
  readonly maximumCents: number;
  readonly unit: "hour";
  readonly currency: typeof DEFAULT_CURRENCY;
  readonly estimatedHoursPerWeek: string;
  readonly additionalCompensation: readonly string[];
}

export interface DemoRole {
  readonly id: DemoId;
  readonly organizationId: DemoId;
  readonly locationId: DemoId;
  readonly managerId: DemoId;
  readonly title: string;
  readonly category: OpportunityCategory;
  readonly status: DemoRoleStatus;
  readonly summary: string;
  readonly description: readonly string[];
  readonly responsibilities: readonly string[];
  readonly requirements: readonly string[];
  readonly training: readonly string[];
  readonly benefits: readonly string[];
  readonly season: {
    readonly beginsOn: string;
    readonly endsOn: string;
    readonly applicationDeadline: string | null;
  };
  readonly openPositions: number;
  readonly housing: DemoHousing;
  readonly meals: DemoMeals;
  readonly pay: DemoPay;
  readonly coverPhoto: DemoPhoto;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly closedAt: string | null;
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoWorkHistoryItem {
  readonly id: DemoId;
  readonly organization: string;
  readonly role: string;
  readonly location: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly highlights: readonly string[];
}

export interface DemoSeeker {
  readonly id: DemoId;
  readonly name: string;
  readonly initials: string;
  readonly fictional: true;
  readonly homeBase: string;
  readonly introduction: string;
  readonly openToStatement: string;
  readonly skills: readonly string[];
  readonly certifications: readonly string[];
  readonly workHistory: readonly DemoWorkHistoryItem[];
  readonly availability: { readonly beginsOn: string; readonly endsOn: string };
  readonly preferences: {
    readonly seasons: readonly string[];
    readonly locations: readonly string[];
    readonly housing: string;
    readonly meals: string;
    readonly payMinimumCents: number;
    readonly payMaximumCents: number;
    readonly payUnit: "hour";
  };
  readonly transportation: readonly string[];
  readonly savedRoleIds: readonly DemoId[];
  readonly viewedRoleIds: readonly DemoId[];
  readonly profileChecklist: readonly DemoProfileChecklistItem[];
  readonly optionalFieldsRemaining: readonly string[];
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoCandidateSummary {
  readonly id: DemoId;
  readonly name: string;
  readonly initials: string;
  readonly homeBase: string;
  readonly headline: string;
  readonly skills: readonly string[];
  readonly availability: { readonly beginsOn: string; readonly endsOn: string };
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoApplication {
  readonly id: DemoId;
  readonly seekerId: DemoId;
  readonly roleId: DemoId;
  readonly status: DemoApplicationStatus;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
  readonly statusChangedAt: string;
  readonly coverNote: string;
  readonly internalNote: string | null;
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoInterview {
  readonly id: DemoId;
  readonly applicationId: DemoId;
  readonly organizerId: DemoId;
  readonly status: SchedulingStatus;
  readonly meetingType: MeetingType;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: "America/Boise";
  readonly locationLabel: string;
  readonly agenda: readonly string[];
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoMessage {
  readonly id: DemoId;
  readonly senderId: DemoId;
  readonly sentAt: string;
  readonly body: string;
  readonly readByParticipantIds: readonly DemoId[];
}

export interface DemoConversation {
  readonly id: DemoId;
  readonly applicationId: DemoId;
  readonly roleId: DemoId;
  readonly participantIds: readonly DemoId[];
  readonly subject: string;
  readonly messages: readonly DemoMessage[];
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export type DemoNotificationKind =
  | "application_status"
  | "interview"
  | "message"
  | "saved_reminder"
  | "matched_listing";

export interface DemoNotification {
  readonly id: DemoId;
  readonly recipientId: DemoId;
  readonly kind: DemoNotificationKind;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly roleId: DemoId | null;
  readonly applicationId: DemoId | null;
  readonly conversationId: DemoId | null;
  readonly interviewId: DemoId | null;
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoInvite {
  readonly id: DemoId;
  readonly roleId: DemoId;
  readonly seekerId: DemoId;
  readonly sentById: DemoId;
  readonly status: "delivered" | "viewed" | "applied";
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoAnnouncement {
  readonly id: DemoId;
  readonly organizationId: DemoId;
  readonly authorId: DemoId;
  readonly status: "draft" | "published";
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoMatch {
  readonly id: DemoId;
  readonly seekerId: DemoId;
  readonly roleId: DemoId;
  readonly score: number;
  readonly band: MatchBand;
  readonly confidence: number;
  readonly components: MatchComponentScores;
  readonly calculatedAt: typeof DEMO_NOW;
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoWeatherDay {
  readonly id: DemoId;
  readonly date: string;
  readonly condition: "Sunny" | "Mostly sunny" | "Partly cloudy" | "Cloudy" | "Light showers";
  readonly highF: number;
  readonly lowF: number;
}

export interface DemoWeatherContext {
  readonly id: DemoId;
  readonly locationId: DemoId;
  readonly generatedAt: typeof DEMO_NOW;
  readonly dataKind: "illustrative_demo_forecast";
  readonly disclosure: string;
  readonly days: readonly DemoWeatherDay[];
}

export interface DemoBilling {
  readonly id: DemoId;
  readonly organizationId: DemoId;
  readonly mode: "demo_only_no_customer";
  readonly planTier: "enterprise";
  readonly planName: "Enterprise";
  readonly interval: "monthly";
  readonly priceCents: number;
  readonly entitlements: {
    readonly listings: number;
    readonly includedInviteCredits: number;
    readonly monthlyAnnouncements: number;
    readonly teamSeats: number;
    readonly analytics: "full";
  };
  readonly note: string;
  readonly demoLabel: typeof DEMO_DATA_LABEL;
}

export interface DemoSessionState {
  readonly schemaVersion: 1;
  readonly listingDecisions: Partial<Record<DemoId, DemoDecision>>;
  readonly readNotificationIds: readonly DemoId[];
  readonly openedConversationId: DemoId | null;
  readonly messageDrafts: Partial<Record<DemoId, string>>;
}

export interface DemoRoleCounts {
  readonly active: number;
  readonly draft: number;
  readonly closed: number;
  readonly total: number;
}

export interface DemoHostSummary {
  readonly roles: DemoRoleCounts;
  readonly applicationsByStage: Readonly<Record<DemoApplicationStage, number>>;
  readonly applicationsTotal: number;
  readonly upcomingInterviews: number;
  readonly offersAwaitingResponse: number;
  readonly unreadConversationCount: number;
  readonly profileCompletion: number;
  readonly invitesUsedThisMonth: number;
  readonly announcementsUsedThisMonth: number;
}

export interface DemoSeekerSummary {
  readonly savedRoles: number;
  readonly applications: number;
  readonly upcomingInterviews: number;
  readonly unreadNotifications: number;
  readonly unreadConversationCount: number;
  readonly recommendations: number;
  readonly profileCompletion: number;
}

export interface FullFidelityDemoScenario {
  readonly schemaVersion: 1;
  readonly now: typeof DEMO_NOW;
  readonly disclosure: typeof DEMO_DISCLOSURE;
  readonly organization: DemoHostOrganization;
  readonly locations: readonly DemoLocation[];
  readonly team: readonly DemoTeamMember[];
  readonly roles: readonly DemoRole[];
  readonly currentSeeker: DemoSeeker;
  readonly candidates: readonly DemoCandidateSummary[];
  readonly applications: readonly DemoApplication[];
  readonly interviews: readonly DemoInterview[];
  readonly conversations: readonly DemoConversation[];
  readonly notifications: readonly DemoNotification[];
  readonly invites: readonly DemoInvite[];
  readonly announcements: readonly DemoAnnouncement[];
  readonly matches: readonly DemoMatch[];
  readonly weather: DemoWeatherContext;
  readonly billing: DemoBilling;
  readonly summaries: {
    readonly host: DemoHostSummary;
    readonly seeker: DemoSeekerSummary;
  };
  readonly initialSessionState: DemoSessionState;
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function profileCompletion(items: readonly DemoProfileChecklistItem[]): number {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 0;
  const completedWeight = items.reduce(
    (sum, item) => sum + (item.complete ? item.weight : 0),
    0,
  );
  return Math.round((completedWeight / totalWeight) * 100);
}

export function demoApplicationStage(status: ApplicationStatus): DemoApplicationStage {
  switch (status) {
    case "applied":
      return "New";
    case "reviewing":
      return "Reviewing";
    case "saved_by_host":
      return "Saved";
    case "offered":
      return "Offered";
    case "accepted":
    case "active":
    case "completed":
      return "Accepted";
    case "not_selected":
    case "withdrawn":
    case "expired":
      return "Closed";
  }
}

export function deriveDemoRoleCounts(roles: readonly DemoRole[]): DemoRoleCounts {
  const active = roles.filter((role) => role.status === "live").length;
  const draft = roles.filter((role) => role.status === "draft").length;
  const closed = roles.filter((role) => role.status === "closed").length;
  return { active, draft, closed, total: roles.length };
}

export function deriveDemoApplicationStageCounts(
  applications: readonly DemoApplication[],
): Readonly<Record<DemoApplicationStage, number>> {
  const counts: Record<DemoApplicationStage, number> = {
    New: 0,
    Reviewing: 0,
    Saved: 0,
    Offered: 0,
    Accepted: 0,
    Closed: 0,
  };
  for (const application of applications) {
    counts[demoApplicationStage(application.status)] += 1;
  }
  return counts;
}

function unreadConversationCount(
  conversations: readonly DemoConversation[],
  participantId: DemoId,
): number {
  return conversations.filter(
    (conversation) =>
      conversation.participantIds.includes(participantId) &&
      conversation.messages.some(
        (message) =>
          message.senderId !== participantId &&
          !message.readByParticipantIds.includes(participantId),
      ),
  ).length;
}

function weightedMatchScore(components: MatchComponentScores): number {
  const raw = (Object.keys(MATCH_SCORE_WEIGHTS) as (keyof MatchComponentScores)[]).reduce(
    (sum, component) =>
      sum + components[component] * (MATCH_SCORE_WEIGHTS[component] / 100),
    0,
  );
  return Math.round(raw);
}

function demoMatch(
  id: DemoId,
  seekerId: DemoId,
  roleId: DemoId,
  components: MatchComponentScores,
  confidence: number,
): DemoMatch {
  const score = weightedMatchScore(components);
  return {
    id,
    seekerId,
    roleId,
    score,
    band: matchBandFor(score),
    confidence,
    components,
    calculatedAt: DEMO_NOW,
    demoLabel: DEMO_DATA_LABEL,
  };
}

const DEMO_LOCATION_ID: DemoId = "demo_location_sandpoint";
const DEMO_ORGANIZATION_ID: DemoId = "demo_org_juniper_wake";
const DEMO_OWNER_ID: DemoId = "demo_team_elena_brooks";
const DEMO_HIRING_MANAGER_ID: DemoId = "demo_team_marcus_lee";
const DEMO_OPERATIONS_LEAD_ID: DemoId = "demo_team_talia_reed";
const DEMO_CURRENT_SEEKER_ID: DemoId = "demo_seeker_priya_shah";

export const DEMO_ROLE_IDS = {
  guestServices: "demo_role_guest_services",
  waterfrontGuide: "demo_role_waterfront_guide",
  kitchenAssistant: "demo_role_kitchen_assistant",
  winterLead: "demo_role_winter_guest_services_lead",
  springGrounds: "demo_role_spring_grounds_crew",
} as const satisfies Record<string, DemoId>;

const DEMO_HOUSING_PHOTOS = [
  {
    id: "demo_photo_housing_sleeping",
    slot: "sleeping_area",
    photoSlug: "lodge-01",
    presentation: "illustrative_demo_scene",
  },
  {
    id: "demo_photo_housing_bathroom",
    slot: "bathroom",
    photoSlug: "lodge-02",
    presentation: "illustrative_demo_scene",
  },
  {
    id: "demo_photo_housing_kitchen",
    slot: "kitchen",
    photoSlug: "kitchen-01",
    presentation: "illustrative_demo_scene",
  },
  {
    id: "demo_photo_housing_common",
    slot: "dining_common",
    photoSlug: "crew-01",
    presentation: "illustrative_demo_scene",
  },
] as const satisfies readonly (DemoPhoto & { readonly slot: HousingPhotoRole })[];

const DEMO_MEALS_PHOTOS = [
  {
    id: "demo_photo_meals_kitchen",
    slot: "kitchen",
    photoSlug: "kitchen-01",
    presentation: "illustrative_demo_scene",
  },
  {
    id: "demo_photo_meals_prepared",
    slot: "prepared",
    photoSlug: "kitchen-02",
    presentation: "illustrative_demo_scene",
  },
  {
    id: "demo_photo_meals_dining",
    slot: "dining",
    photoSlug: "crew-02",
    presentation: "illustrative_demo_scene",
  },
  {
    id: "demo_photo_meals_misc",
    slot: "misc",
    photoSlug: "kitchen-03",
    presentation: "illustrative_demo_scene",
  },
] as const satisfies readonly (DemoPhoto & { readonly slot: DemoMealsPhotoSlot })[];

export const DEMO_LOCATIONS: readonly DemoLocation[] = [
  {
    id: DEMO_LOCATION_ID,
    name: "Juniper Wake — Lake Pend Oreille",
    locality: "Sandpoint",
    region: "Idaho",
    country: "United States",
    timeZone: "America/Boise",
    coordinates: { lat: 48.2766, lon: -116.5535 },
    summary:
      "A walkable lake town ringed by public shoreline, forest trails, and the Selkirk Mountains.",
    remoteness:
      "Town services are about 15 minutes away. Staff housing and the main lodge share one property.",
    transportation: [
      "Daily staff shuttle between housing, the lodge, and downtown",
      "Amtrak service in Sandpoint",
      "Spokane International Airport is about 90 minutes away",
    ],
    nearbyServices: ["Grocery store", "Urgent care", "Pharmacy", "Public library"],
    activities: [
      "Lake paddling",
      "Selkirk hiking",
      "Downtown farmers market",
      "Cycling the Pend d'Oreille Bay Trail",
    ],
  },
];

export const DEMO_TEAM: readonly DemoTeamMember[] = [
  {
    id: DEMO_OWNER_ID,
    name: "Elena Brooks",
    initials: initialsOf("Elena Brooks"),
    title: "Owner and General Manager",
    summary:
      "Elena sets the season plan, leads weekly crew meetings, and owns the host workspace.",
    publicProfile: true,
    workspaceAccess: "owner",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: DEMO_HIRING_MANAGER_ID,
    name: "Marcus Lee",
    initials: initialsOf("Marcus Lee"),
    title: "Guest Experience Manager",
    summary:
      "Marcus trains front-of-house and waterfront staff and coordinates candidate interviews.",
    publicProfile: true,
    workspaceAccess: "none",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: DEMO_OPERATIONS_LEAD_ID,
    name: "Talia Reed",
    initials: initialsOf("Talia Reed"),
    title: "Lodge Operations Lead",
    summary:
      "Talia runs housing orientation, kitchen handoffs, and the daily operating schedule.",
    publicProfile: true,
    workspaceAccess: "none",
    demoLabel: DEMO_DATA_LABEL,
  },
];

export const DEMO_ORGANIZATION: DemoHostOrganization = {
  id: DEMO_ORGANIZATION_ID,
  name: "Juniper Wake Lodge",
  initials: "JW",
  fictional: true,
  verified: true,
  category: "Seasonal lodge and outfitter",
  hostSince: "2024-03-18",
  tagline:
    "A North Idaho lake season built around thoughtful hospitality, practical training, and time outside.",
  story: [
    "Juniper Wake Lodge is a fictional, family-operated demonstration host on Lake Pend Oreille. The team welcomes small groups for paddling, trail days, and quiet weekends by the water.",
    "Seasonal crew rotate through clear stations, share a staff meal after the evening turn, and have two consecutive days off whenever the operating calendar allows.",
  ],
  mission:
    "Give guests an easy way into the outdoors while giving seasonal staff clear terms, useful training, and a dependable home base.",
  culture: [
    "Direct, respectful communication",
    "Safety before speed",
    "Shared ownership of guest handoffs",
    "Protected time away from work",
  ],
  managementApproach:
    "Managers publish the weekly schedule ten days ahead, hold a short morning stand-up, and use one-on-ones for feedback instead of correcting people in front of guests.",
  training: [
    "Two paid orientation days",
    "Role shadowing before solo shifts",
    "CPR reimbursement for waterfront staff",
    "End-of-season reference and skills recap",
  ],
  seasonRhythm: [
    "Late August: fall crew onboarding",
    "September: warm days and busy weekends",
    "October: retreat groups and earlier evening closes",
    "November: property close-down and season handoff",
  ],
  locationIds: [DEMO_LOCATION_ID],
  teamMemberIds: [DEMO_OWNER_ID, DEMO_HIRING_MANAGER_ID, DEMO_OPERATIONS_LEAD_ID],
  coverPhoto: {
    id: "demo_photo_org_cover",
    slot: "cover",
    photoSlug: "cda-lake-03",
    presentation: "illustrative_demo_scene",
  },
  gallery: [
    {
      id: "demo_photo_org_work",
      slot: "work",
      photoSlug: "paddle-01",
      presentation: "illustrative_demo_scene",
    },
    {
      id: "demo_photo_org_location",
      slot: "location",
      photoSlug: "trail-01",
      presentation: "illustrative_demo_scene",
    },
    ...DEMO_HOUSING_PHOTOS,
    ...DEMO_MEALS_PHOTOS,
  ],
  housingLibrary: DEMO_HOUSING_PHOTOS,
  faqs: [
    {
      id: "demo_faq_arrival",
      question: "How do crew members get from Spokane to the lodge?",
      answer:
        "The host coordinates one pickup window on each arrival day. Staff arriving outside it receive the shuttle and rail options before travel is booked.",
    },
    {
      id: "demo_faq_days_off",
      question: "How are days off scheduled?",
      answer:
        "Schedules are posted ten days ahead. The team aims for two consecutive days off and confirms exceptions before publishing the week.",
    },
    {
      id: "demo_faq_housing",
      question: "What should staff bring for housing?",
      answer:
        "Linens, cookware, and basic cleaning supplies are provided. Staff bring personal toiletries and any specialty kitchen items they rely on.",
    },
  ],
  profileChecklist: [
    {
      id: "demo_host_check_identity",
      label: "Identity and story",
      complete: true,
      weight: 20,
      public: true,
    },
    {
      id: "demo_host_check_location",
      label: "Location and transportation",
      complete: true,
      weight: 15,
      public: true,
    },
    {
      id: "demo_host_check_housing",
      label: "Housing details",
      complete: true,
      weight: 20,
      public: true,
    },
    {
      id: "demo_host_check_team",
      label: "Public team",
      complete: true,
      weight: 15,
      public: true,
    },
    {
      id: "demo_host_check_media",
      label: "Workplace media",
      complete: true,
      weight: 20,
      public: true,
    },
    {
      id: "demo_host_check_optional_faq",
      label: "Add one more FAQ",
      complete: false,
      weight: 10,
      public: true,
    },
  ],
  reviews: [],
  demoLabel: DEMO_DATA_LABEL,
};

const SHARED_HOUSING = {
  provision: "provided",
  summary: "Shared staff cabin on site",
  type: "Shared two-person cabin room",
  costCents: 0,
  costUnit: "week",
  occupancy: "Two people per bedroom; four per cabin",
  distanceFromWork: "About a 6-minute walk",
  availability: "Available for the full listed season",
  amenities: ["Wi-Fi", "Laundry", "Shared kitchen", "Heat", "Secure gear storage"],
  utilities: ["Electricity", "Water", "Heat", "Wi-Fi"],
  rules: ["Quiet hours after 10:30 PM", "No smoking indoors", "No overnight guests"],
  photoSetId: "demo_photo_set_staff_housing",
} as const satisfies DemoHousing;

const SHARED_MEALS = {
  provision: "partial",
  summary: "One staff meal on every shift",
  costCents: 0,
  costUnit: "shift",
  style: "Family-style staff meal plus self-serve breakfast staples",
  included: ["One hot meal per shift", "Coffee and tea", "Breakfast staples"],
  dietaryAccommodations: ["Vegetarian", "Dairy-free with notice", "Gluten-aware options"],
  photos: DEMO_MEALS_PHOTOS,
} as const satisfies DemoMeals;

export const DEMO_ROLES: readonly DemoRole[] = [
  {
    id: DEMO_ROLE_IDS.guestServices,
    organizationId: DEMO_ORGANIZATION_ID,
    locationId: DEMO_LOCATION_ID,
    managerId: DEMO_HIRING_MANAGER_ID,
    title: "Guest Services Coordinator",
    category: "seasonal",
    status: "live",
    summary:
      "Own warm arrivals, clear guest handoffs, and the front desk rhythm for the fall lake season.",
    description: [
      "Guest Services Coordinators guide each stay from arrival through departure. The work blends reservations, local recommendations, and close coordination with housekeeping and waterfront teams.",
      "The role suits someone who likes solving practical problems and can stay calm when several guests need help at once.",
    ],
    responsibilities: [
      "Run check-in and departure workflows",
      "Answer pre-arrival and in-stay questions",
      "Coordinate room status with lodge operations",
      "Close the front desk and document handoffs",
    ],
    requirements: [
      "One season of hospitality, retail, or guest-facing work",
      "Comfortable learning reservation and point-of-sale tools",
      "Available for weekend and holiday shifts",
      "Able to lift 35 pounds",
    ],
    training: ["Two paid orientation days", "Three shadow shifts", "Weekly service coaching"],
    benefits: ["Completion bonus", "Paddle equipment access", "CPR reimbursement"],
    season: {
      beginsOn: "2026-08-24",
      endsOn: "2026-11-01",
      applicationDeadline: "2026-08-18",
    },
    openPositions: 2,
    housing: SHARED_HOUSING,
    meals: SHARED_MEALS,
    pay: {
      provision: "provided",
      summary: "$19–$22/hr",
      minimumCents: 1900,
      maximumCents: 2200,
      unit: "hour",
      currency: DEFAULT_CURRENCY,
      estimatedHoursPerWeek: "32–40",
      additionalCompensation: ["$500 completion bonus after the full season"],
    },
    coverPhoto: {
      id: "demo_photo_role_guest_services",
      slot: "cover",
      photoSlug: "lodge-03",
      presentation: "illustrative_demo_scene",
    },
    createdAt: "2026-07-10T17:00:00.000Z",
    publishedAt: "2026-07-14T16:00:00.000Z",
    closedAt: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: DEMO_ROLE_IDS.waterfrontGuide,
    organizationId: DEMO_ORGANIZATION_ID,
    locationId: DEMO_LOCATION_ID,
    managerId: DEMO_HIRING_MANAGER_ID,
    title: "Waterfront & Trail Guide",
    category: "seasonal",
    status: "live",
    summary:
      "Lead beginner paddles, short trail outings, and practical outdoor orientation for lodge guests.",
    description: [
      "Guides make the outdoors approachable for first-time guests. Most sessions are half-day lake paddles or local trail walks, with equipment checks and concise safety briefings built into every departure.",
      "The team trains on Juniper Wake routes before anyone leads independently.",
    ],
    responsibilities: [
      "Lead small-group paddle and trail sessions",
      "Fit guests with safety equipment",
      "Log weather and equipment checks",
      "Support waterfront opening and close-down",
    ],
    requirements: [
      "Current CPR/AED certification by start date",
      "Comfortable swimming in open water",
      "Experience leading groups outdoors",
      "Valid driver's license",
    ],
    training: ["Paid route familiarization", "Rescue-practice day", "Guest briefing workshop"],
    benefits: ["Certification reimbursement", "Guide equipment provided", "Completion bonus"],
    season: {
      beginsOn: "2026-08-17",
      endsOn: "2026-10-18",
      applicationDeadline: "2026-08-28",
    },
    openPositions: 2,
    housing: SHARED_HOUSING,
    meals: SHARED_MEALS,
    pay: {
      provision: "provided",
      summary: "$21–$25/hr",
      minimumCents: 2100,
      maximumCents: 2500,
      unit: "hour",
      currency: DEFAULT_CURRENCY,
      estimatedHoursPerWeek: "30–38",
      additionalCompensation: ["Certification reimbursement up to $250"],
    },
    coverPhoto: {
      id: "demo_photo_role_waterfront",
      slot: "cover",
      photoSlug: "paddle-02",
      presentation: "illustrative_demo_scene",
    },
    createdAt: "2026-07-09T17:00:00.000Z",
    publishedAt: "2026-07-12T16:00:00.000Z",
    closedAt: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: DEMO_ROLE_IDS.kitchenAssistant,
    organizationId: DEMO_ORGANIZATION_ID,
    locationId: DEMO_LOCATION_ID,
    managerId: DEMO_OPERATIONS_LEAD_ID,
    title: "Lodge Kitchen Assistant",
    category: "seasonal",
    status: "live",
    summary:
      "Prep straightforward lodge meals, keep a clean station, and help make staff dinner dependable.",
    description: [
      "Kitchen Assistants work beside the lodge cook on breakfast prep, simple dinner service, and staff meals. Recipes, pars, and close-down checklists are written down.",
      "This is a practical learning role with steady feedback, not an unstructured trial by fire.",
    ],
    responsibilities: [
      "Prepare vegetables, salads, and simple baked items",
      "Maintain dish and sanitation stations",
      "Label and rotate ingredients",
      "Help serve and reset staff dinner",
    ],
    requirements: [
      "Six months of kitchen, café, or high-volume food experience",
      "Able to stand for a full shift",
      "Food-handler permit by start date",
      "Comfortable working early breakfast shifts",
    ],
    training: ["Paid kitchen orientation", "Food-handler reimbursement", "Recipe and allergy briefing"],
    benefits: ["Food-handler reimbursement", "Completion bonus", "Two staff meals on double shifts"],
    season: {
      beginsOn: "2026-09-01",
      endsOn: "2026-11-08",
      applicationDeadline: "2026-08-22",
    },
    openPositions: 1,
    housing: {
      ...SHARED_HOUSING,
      summary: "Optional shared staff cabin",
      costCents: 7500,
      costUnit: "week",
    },
    meals: {
      ...SHARED_MEALS,
      provision: "provided",
      summary: "One staff meal per shift; two on double shifts",
    },
    pay: {
      provision: "provided",
      summary: "$18.50–$21/hr",
      minimumCents: 1850,
      maximumCents: 2100,
      unit: "hour",
      currency: DEFAULT_CURRENCY,
      estimatedHoursPerWeek: "32–40",
      additionalCompensation: ["$400 completion bonus after the full season"],
    },
    coverPhoto: {
      id: "demo_photo_role_kitchen",
      slot: "cover",
      photoSlug: "kitchen-02",
      presentation: "illustrative_demo_scene",
    },
    createdAt: "2026-07-12T17:00:00.000Z",
    publishedAt: "2026-07-18T16:00:00.000Z",
    closedAt: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: DEMO_ROLE_IDS.winterLead,
    organizationId: DEMO_ORGANIZATION_ID,
    locationId: DEMO_LOCATION_ID,
    managerId: DEMO_OWNER_ID,
    title: "Winter Guest Services Lead",
    category: "seasonal",
    status: "draft",
    summary:
      "Prepare the smaller winter desk team for retreat arrivals and mountain-weather travel changes.",
    description: [
      "This draft captures the planned winter lead role while season dates and staffing coverage are still being finalized.",
    ],
    responsibilities: [
      "Lead winter arrival planning",
      "Train two guest-services coordinators",
      "Coordinate weather-related guest updates",
    ],
    requirements: [
      "Two years of hospitality experience",
      "Prior shift-lead responsibility",
      "Comfortable driving in winter conditions",
    ],
    training: ["Property systems refresher", "Winter emergency procedures"],
    benefits: ["Completion bonus", "Winter equipment stipend"],
    season: {
      beginsOn: "2026-12-07",
      endsOn: "2027-03-28",
      applicationDeadline: null,
    },
    openPositions: 1,
    housing: {
      ...SHARED_HOUSING,
      summary: "Private room in a shared heated staff cabin",
      occupancy: "Private bedroom; shared kitchen and living space",
    },
    meals: SHARED_MEALS,
    pay: {
      provision: "provided",
      summary: "$22–$26/hr",
      minimumCents: 2200,
      maximumCents: 2600,
      unit: "hour",
      currency: DEFAULT_CURRENCY,
      estimatedHoursPerWeek: "35–40",
      additionalCompensation: ["$700 completion bonus after the full season"],
    },
    coverPhoto: {
      id: "demo_photo_role_winter",
      slot: "cover",
      photoSlug: "idaho-03",
      presentation: "illustrative_demo_scene",
    },
    createdAt: "2026-08-02T17:00:00.000Z",
    publishedAt: null,
    closedAt: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: DEMO_ROLE_IDS.springGrounds,
    organizationId: DEMO_ORGANIZATION_ID,
    locationId: DEMO_LOCATION_ID,
    managerId: DEMO_OPERATIONS_LEAD_ID,
    title: "Spring Grounds Crew",
    category: "seasonal",
    status: "closed",
    summary:
      "A completed spring role that prepared trails, docks, and guest spaces for opening weekend.",
    description: [
      "The spring crew reopened paths, staged waterfront equipment, and completed exterior maintenance before summer arrivals.",
    ],
    responsibilities: [
      "Clear and mark lodge trails",
      "Stage dock and paddle equipment",
      "Prepare outdoor guest spaces",
    ],
    requirements: [
      "Able to work outdoors in variable spring weather",
      "Comfortable lifting 50 pounds",
      "Basic hand-tool experience",
    ],
    training: ["Tool and equipment orientation", "Trail safety briefing"],
    benefits: ["Work gloves and rain gear provided", "Season completion bonus"],
    season: {
      beginsOn: "2026-05-04",
      endsOn: "2026-07-19",
      applicationDeadline: "2026-04-20",
    },
    openPositions: 0,
    housing: SHARED_HOUSING,
    meals: SHARED_MEALS,
    pay: {
      provision: "provided",
      summary: "$18–$20/hr",
      minimumCents: 1800,
      maximumCents: 2000,
      unit: "hour",
      currency: DEFAULT_CURRENCY,
      estimatedHoursPerWeek: "36–40",
      additionalCompensation: ["$350 completion bonus paid at close"],
    },
    coverPhoto: {
      id: "demo_photo_role_grounds",
      slot: "cover",
      photoSlug: "trail-03",
      presentation: "illustrative_demo_scene",
    },
    createdAt: "2026-03-09T17:00:00.000Z",
    publishedAt: "2026-03-16T16:00:00.000Z",
    closedAt: "2026-07-20T16:00:00.000Z",
    demoLabel: DEMO_DATA_LABEL,
  },
];

export const DEMO_CURRENT_SEEKER: DemoSeeker = {
  id: DEMO_CURRENT_SEEKER_ID,
  name: "Priya Shah",
  initials: initialsOf("Priya Shah"),
  fictional: true,
  homeBase: "Bellingham, Washington",
  introduction:
    "Guest-focused outdoor worker with two summer seasons in waterfront operations and a calm, practical approach to first-time visitors.",
  openToStatement:
    "Open to late-summer and fall lodge, guide, and guest-services roles in the inland Northwest.",
  skills: [
    "Guest check-in",
    "Beginner paddle instruction",
    "Group briefings",
    "Reservation systems",
    "Equipment checks",
    "Conflict de-escalation",
  ],
  certifications: ["Adult and Pediatric CPR/AED — valid through 2027-05"],
  workHistory: [
    {
      id: "demo_work_history_bay_paddle",
      organization: "Bayline Paddle Center",
      role: "Guest Operations Lead",
      location: "Bellingham, Washington",
      startsOn: "2025-05-12",
      endsOn: "2025-09-28",
      highlights: [
        "Led daily safety briefings for beginner rentals",
        "Trained four new seasonal staff on check-in and equipment returns",
        "Closed registers and documented equipment maintenance needs",
      ],
    },
    {
      id: "demo_work_history_foothill_camp",
      organization: "Foothill Day Camp",
      role: "Outdoor Programs Assistant",
      location: "Bend, Oregon",
      startsOn: "2024-06-03",
      endsOn: "2024-08-23",
      highlights: [
        "Supported trail and lake activities for groups of up to 14",
        "Adapted programs for weather and participant comfort",
      ],
    },
  ],
  availability: { beginsOn: "2026-08-17", endsOn: "2026-11-15" },
  preferences: {
    seasons: ["Late summer", "Fall"],
    locations: ["Idaho", "Montana", "Washington"],
    housing: "Needs employer housing within walking distance or a reliable shuttle",
    meals: "Prefers at least one meal on working days",
    payMinimumCents: 1900,
    payMaximumCents: 2600,
    payUnit: "hour",
  },
  transportation: ["Valid driver's license", "No personal vehicle this season"],
  savedRoleIds: [DEMO_ROLE_IDS.kitchenAssistant],
  viewedRoleIds: [
    DEMO_ROLE_IDS.guestServices,
    DEMO_ROLE_IDS.waterfrontGuide,
    DEMO_ROLE_IDS.kitchenAssistant,
  ],
  profileChecklist: [
    {
      id: "demo_seeker_check_intro",
      label: "Introduction",
      complete: true,
      weight: 15,
      public: true,
    },
    {
      id: "demo_seeker_check_history",
      label: "Work history",
      complete: true,
      weight: 25,
      public: true,
    },
    {
      id: "demo_seeker_check_skills",
      label: "Skills and certification",
      complete: true,
      weight: 15,
      public: true,
    },
    {
      id: "demo_seeker_check_availability",
      label: "Availability",
      complete: true,
      weight: 15,
      public: true,
    },
    {
      id: "demo_seeker_check_preferences",
      label: "Role preferences",
      complete: true,
      weight: 15,
      public: true,
    },
    {
      id: "demo_seeker_check_transport",
      label: "Transportation",
      complete: true,
      weight: 10,
      public: false,
    },
    {
      id: "demo_seeker_check_optional_portfolio",
      label: "Optional portfolio link",
      complete: false,
      weight: 5,
      public: true,
    },
  ],
  optionalFieldsRemaining: ["Portfolio link"],
  demoLabel: DEMO_DATA_LABEL,
};

export const DEMO_CANDIDATES: readonly DemoCandidateSummary[] = [
  {
    id: DEMO_CURRENT_SEEKER_ID,
    name: DEMO_CURRENT_SEEKER.name,
    initials: DEMO_CURRENT_SEEKER.initials,
    homeBase: DEMO_CURRENT_SEEKER.homeBase,
    headline: "Guest operations and beginner outdoor programs",
    skills: DEMO_CURRENT_SEEKER.skills,
    availability: DEMO_CURRENT_SEEKER.availability,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_seeker_mateo_ruiz",
    name: "Mateo Ruiz",
    initials: initialsOf("Mateo Ruiz"),
    homeBase: "Boise, Idaho",
    headline: "Hotel front desk and bilingual guest support",
    skills: ["Guest check-in", "Spanish", "Night audit", "Reservation systems"],
    availability: { beginsOn: "2026-08-20", endsOn: "2026-11-08" },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_seeker_nia_okafor",
    name: "Nia Okafor",
    initials: initialsOf("Nia Okafor"),
    homeBase: "Missoula, Montana",
    headline: "Trail educator and wilderness first responder",
    skills: ["Interpretive walks", "Wilderness first aid", "Risk assessment", "Leave No Trace"],
    availability: { beginsOn: "2026-08-15", endsOn: "2026-10-25" },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_seeker_jonah_kim",
    name: "Jonah Kim",
    initials: initialsOf("Jonah Kim"),
    homeBase: "Portland, Oregon",
    headline: "Paddle guide with small-group instruction experience",
    skills: ["Kayak instruction", "CPR/AED", "Open-water rescue", "Guest briefings"],
    availability: { beginsOn: "2026-08-14", endsOn: "2026-10-22" },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_seeker_aisha_bennett",
    name: "Aisha Bennett",
    initials: initialsOf("Aisha Bennett"),
    homeBase: "Spokane, Washington",
    headline: "Café prep cook focused on organized, clean service",
    skills: ["Food prep", "Allergen awareness", "Dish station", "Inventory rotation"],
    availability: { beginsOn: "2026-08-28", endsOn: "2026-11-10" },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_seeker_caleb_morgan",
    name: "Caleb Morgan",
    initials: initialsOf("Caleb Morgan"),
    homeBase: "Coeur d'Alene, Idaho",
    headline: "Grounds and trail maintenance worker",
    skills: ["Trail maintenance", "Hand tools", "Dock setup", "Equipment checks"],
    availability: { beginsOn: "2026-05-01", endsOn: "2026-07-22" },
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_seeker_sofia_park",
    name: "Sofia Park",
    initials: initialsOf("Sofia Park"),
    homeBase: "Helena, Montana",
    headline: "Seasonal hospitality coordinator",
    skills: ["Group arrivals", "Guest email", "Scheduling", "Local recommendations"],
    availability: { beginsOn: "2026-08-25", endsOn: "2026-11-05" },
    demoLabel: DEMO_DATA_LABEL,
  },
];

export const DEMO_APPLICATIONS: readonly DemoApplication[] = [
  {
    id: "demo_application_priya_guest_services",
    seekerId: DEMO_CURRENT_SEEKER_ID,
    roleId: DEMO_ROLE_IDS.guestServices,
    status: "reviewing",
    submittedAt: "2026-07-29T18:12:00.000Z",
    reviewedAt: "2026-07-30T15:40:00.000Z",
    statusChangedAt: "2026-07-30T15:40:00.000Z",
    coverNote:
      "I enjoy making arrivals feel organized and unhurried, and my waterfront season taught me how important a clear handoff is between guest-facing and operating teams.",
    internalNote: "Strong overlap with front desk and waterfront needs. Confirm late-October availability.",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_application_mateo_guest_services",
    seekerId: "demo_seeker_mateo_ruiz",
    roleId: DEMO_ROLE_IDS.guestServices,
    status: "applied",
    submittedAt: "2026-08-05T14:26:00.000Z",
    reviewedAt: null,
    statusChangedAt: "2026-08-05T14:26:00.000Z",
    coverNote:
      "I have two years of front-desk experience and would like to bring bilingual guest support to a smaller seasonal team.",
    internalNote: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_application_nia_waterfront",
    seekerId: "demo_seeker_nia_okafor",
    roleId: DEMO_ROLE_IDS.waterfrontGuide,
    status: "saved_by_host",
    submittedAt: "2026-07-25T20:05:00.000Z",
    reviewedAt: "2026-07-27T16:18:00.000Z",
    statusChangedAt: "2026-08-01T17:10:00.000Z",
    coverNote:
      "My strongest work is helping people feel capable outdoors without making the experience feel overly technical.",
    internalNote: "WFR and interpretation background are a strong fit. Interview scheduled.",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_application_jonah_waterfront",
    seekerId: "demo_seeker_jonah_kim",
    roleId: DEMO_ROLE_IDS.waterfrontGuide,
    status: "offered",
    submittedAt: "2026-07-19T19:30:00.000Z",
    reviewedAt: "2026-07-21T14:22:00.000Z",
    statusChangedAt: "2026-08-03T18:00:00.000Z",
    coverNote:
      "I have led beginner kayak sessions for three summers and like the balance of technical safety and friendly instruction in this role.",
    internalNote: "Offer sent August 3; response requested by August 9.",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_application_aisha_kitchen",
    seekerId: "demo_seeker_aisha_bennett",
    roleId: DEMO_ROLE_IDS.kitchenAssistant,
    status: "accepted",
    submittedAt: "2026-07-20T22:08:00.000Z",
    reviewedAt: "2026-07-22T15:44:00.000Z",
    statusChangedAt: "2026-08-02T17:35:00.000Z",
    coverNote:
      "I am looking for a season where a small kitchen values preparation, food safety, and steady teamwork.",
    internalNote: "Accepted. Housing request confirmed for August 28 arrival.",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_application_caleb_grounds",
    seekerId: "demo_seeker_caleb_morgan",
    roleId: DEMO_ROLE_IDS.springGrounds,
    status: "not_selected",
    submittedAt: "2026-04-03T16:20:00.000Z",
    reviewedAt: "2026-04-05T15:10:00.000Z",
    statusChangedAt: "2026-04-08T18:45:00.000Z",
    coverNote:
      "I have local trail maintenance experience and am available for the complete spring opening window.",
    internalNote: "Qualified; another candidate had the required dock-equipment experience.",
    demoLabel: DEMO_DATA_LABEL,
  },
];

export const DEMO_INTERVIEWS: readonly DemoInterview[] = [
  {
    id: "demo_interview_priya_guest_services",
    applicationId: "demo_application_priya_guest_services",
    organizerId: DEMO_OWNER_ID,
    status: "selected",
    meetingType: "video",
    startsAt: "2026-08-08T17:00:00.000Z",
    endsAt: "2026-08-08T17:30:00.000Z",
    timeZone: "America/Boise",
    locationLabel: "Video call details shown inside the demo schedule",
    agenda: ["Season availability", "Guest handoffs", "Housing questions", "Candidate questions"],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_interview_nia_waterfront",
    applicationId: "demo_application_nia_waterfront",
    organizerId: DEMO_OWNER_ID,
    status: "selected",
    meetingType: "video",
    startsAt: "2026-08-10T18:30:00.000Z",
    endsAt: "2026-08-10T19:00:00.000Z",
    timeZone: "America/Boise",
    locationLabel: "Video call details shown inside the demo schedule",
    agenda: ["Route leadership", "Risk scenarios", "Certifications", "Candidate questions"],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_interview_jonah_waterfront",
    applicationId: "demo_application_jonah_waterfront",
    organizerId: DEMO_OWNER_ID,
    status: "completed",
    meetingType: "video",
    startsAt: "2026-08-01T17:00:00.000Z",
    endsAt: "2026-08-01T17:30:00.000Z",
    timeZone: "America/Boise",
    locationLabel: "Completed video interview",
    agenda: ["Instruction style", "Open-water rescue", "Season logistics"],
    demoLabel: DEMO_DATA_LABEL,
  },
];

export const DEMO_CONVERSATIONS: readonly DemoConversation[] = [
  {
    id: "demo_conversation_priya_guest_services",
    applicationId: "demo_application_priya_guest_services",
    roleId: DEMO_ROLE_IDS.guestServices,
    participantIds: [DEMO_CURRENT_SEEKER_ID, DEMO_OWNER_ID],
    subject: "Guest Services Coordinator interview",
    messages: [
      {
        id: "demo_message_priya_01",
        senderId: DEMO_OWNER_ID,
        sentAt: "2026-08-03T17:12:00.000Z",
        body: "Hi Priya — your waterfront guest-operations background stood out. Would you be open to a 30-minute video interview?",
        readByParticipantIds: [DEMO_OWNER_ID, DEMO_CURRENT_SEEKER_ID],
      },
      {
        id: "demo_message_priya_02",
        senderId: DEMO_CURRENT_SEEKER_ID,
        sentAt: "2026-08-03T18:06:00.000Z",
        body: "Absolutely. Friday morning or Saturday after 9:00 AM Pacific both work for me. I would also like to ask about the late-October schedule.",
        readByParticipantIds: [DEMO_OWNER_ID, DEMO_CURRENT_SEEKER_ID],
      },
      {
        id: "demo_message_priya_03",
        senderId: DEMO_OWNER_ID,
        sentAt: "2026-08-05T15:42:00.000Z",
        body: "Saturday is confirmed. I added the time to your schedule, and we can walk through the October calendar together.",
        readByParticipantIds: [DEMO_OWNER_ID],
      },
    ],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_conversation_nia_waterfront",
    applicationId: "demo_application_nia_waterfront",
    roleId: DEMO_ROLE_IDS.waterfrontGuide,
    participantIds: ["demo_seeker_nia_okafor", DEMO_OWNER_ID],
    subject: "Waterfront & Trail Guide interview",
    messages: [
      {
        id: "demo_message_nia_01",
        senderId: DEMO_OWNER_ID,
        sentAt: "2026-08-04T16:05:00.000Z",
        body: "Thanks for confirming Sunday. We will spend part of the interview on how you adapt a trail plan when weather changes.",
        readByParticipantIds: [DEMO_OWNER_ID, "demo_seeker_nia_okafor"],
      },
    ],
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_conversation_jonah_waterfront",
    applicationId: "demo_application_jonah_waterfront",
    roleId: DEMO_ROLE_IDS.waterfrontGuide,
    participantIds: ["demo_seeker_jonah_kim", DEMO_OWNER_ID],
    subject: "Waterfront & Trail Guide offer",
    messages: [
      {
        id: "demo_message_jonah_01",
        senderId: DEMO_OWNER_ID,
        sentAt: "2026-08-03T18:04:00.000Z",
        body: "Your offer is ready in the application workspace. It includes the season dates, hourly range, housing, and response deadline.",
        readByParticipantIds: [DEMO_OWNER_ID, "demo_seeker_jonah_kim"],
      },
      {
        id: "demo_message_jonah_02",
        senderId: "demo_seeker_jonah_kim",
        sentAt: "2026-08-05T15:24:00.000Z",
        body: "Thank you. Before I respond, can you confirm whether the August 14 arrival is available for staff housing?",
        readByParticipantIds: ["demo_seeker_jonah_kim"],
      },
    ],
    demoLabel: DEMO_DATA_LABEL,
  },
];

export const DEMO_NOTIFICATIONS: readonly DemoNotification[] = [
  {
    id: "demo_notification_priya_reviewing",
    recipientId: DEMO_CURRENT_SEEKER_ID,
    kind: "application_status",
    title: "Your application is being reviewed",
    body: "Juniper Wake Lodge moved Guest Services Coordinator to Reviewing.",
    createdAt: "2026-07-30T15:40:00.000Z",
    readAt: "2026-07-30T17:02:00.000Z",
    roleId: DEMO_ROLE_IDS.guestServices,
    applicationId: "demo_application_priya_guest_services",
    conversationId: null,
    interviewId: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_notification_priya_interview",
    recipientId: DEMO_CURRENT_SEEKER_ID,
    kind: "interview",
    title: "Interview confirmed",
    body: "Your Guest Services Coordinator interview is Saturday at 10:00 AM Pacific.",
    createdAt: "2026-08-04T18:10:00.000Z",
    readAt: "2026-08-04T18:24:00.000Z",
    roleId: DEMO_ROLE_IDS.guestServices,
    applicationId: "demo_application_priya_guest_services",
    conversationId: "demo_conversation_priya_guest_services",
    interviewId: "demo_interview_priya_guest_services",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_notification_priya_message",
    recipientId: DEMO_CURRENT_SEEKER_ID,
    kind: "message",
    title: "New message from Juniper Wake Lodge",
    body: "Elena confirmed your interview and will cover the October calendar with you.",
    createdAt: "2026-08-05T15:42:00.000Z",
    readAt: null,
    roleId: DEMO_ROLE_IDS.guestServices,
    applicationId: "demo_application_priya_guest_services",
    conversationId: "demo_conversation_priya_guest_services",
    interviewId: "demo_interview_priya_guest_services",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_notification_priya_saved_deadline",
    recipientId: DEMO_CURRENT_SEEKER_ID,
    kind: "saved_reminder",
    title: "Saved role closes August 22",
    body: "Lodge Kitchen Assistant is still saved. Review housing, meals, and pay before deciding.",
    createdAt: "2026-08-05T13:00:00.000Z",
    readAt: null,
    roleId: DEMO_ROLE_IDS.kitchenAssistant,
    applicationId: null,
    conversationId: null,
    interviewId: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_notification_priya_match",
    recipientId: DEMO_CURRENT_SEEKER_ID,
    kind: "matched_listing",
    title: "Strong match near Sandpoint",
    body: "Waterfront & Trail Guide aligns with your availability, housing needs, and outdoor work.",
    createdAt: "2026-08-03T16:30:00.000Z",
    readAt: "2026-08-03T18:01:00.000Z",
    roleId: DEMO_ROLE_IDS.waterfrontGuide,
    applicationId: null,
    conversationId: null,
    interviewId: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_notification_host_new_application",
    recipientId: DEMO_OWNER_ID,
    kind: "application_status",
    title: "New application to review",
    body: "Mateo Ruiz applied for Guest Services Coordinator.",
    createdAt: "2026-08-05T14:26:00.000Z",
    readAt: null,
    roleId: DEMO_ROLE_IDS.guestServices,
    applicationId: "demo_application_mateo_guest_services",
    conversationId: null,
    interviewId: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_notification_host_message",
    recipientId: DEMO_OWNER_ID,
    kind: "message",
    title: "Jonah asked about staff housing",
    body: "A candidate with a pending waterfront offer sent a new message.",
    createdAt: "2026-08-05T15:24:00.000Z",
    readAt: null,
    roleId: DEMO_ROLE_IDS.waterfrontGuide,
    applicationId: "demo_application_jonah_waterfront",
    conversationId: "demo_conversation_jonah_waterfront",
    interviewId: null,
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_notification_host_interview",
    recipientId: DEMO_OWNER_ID,
    kind: "interview",
    title: "Upcoming interview",
    body: "Priya Shah confirmed Saturday's Guest Services Coordinator interview.",
    createdAt: "2026-08-04T18:10:00.000Z",
    readAt: "2026-08-04T18:12:00.000Z",
    roleId: DEMO_ROLE_IDS.guestServices,
    applicationId: "demo_application_priya_guest_services",
    conversationId: "demo_conversation_priya_guest_services",
    interviewId: "demo_interview_priya_guest_services",
    demoLabel: DEMO_DATA_LABEL,
  },
];

export const DEMO_INVITES: readonly DemoInvite[] = [
  {
    id: "demo_invite_nia_waterfront",
    roleId: DEMO_ROLE_IDS.waterfrontGuide,
    seekerId: "demo_seeker_nia_okafor",
    sentById: DEMO_OWNER_ID,
    status: "applied",
    sentAt: "2026-07-18T16:20:00.000Z",
    expiresAt: "2026-08-01T16:20:00.000Z",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_invite_sofia_guest_services",
    roleId: DEMO_ROLE_IDS.guestServices,
    seekerId: "demo_seeker_sofia_park",
    sentById: DEMO_OWNER_ID,
    status: "viewed",
    sentAt: "2026-08-02T17:05:00.000Z",
    expiresAt: "2026-08-16T17:05:00.000Z",
    demoLabel: DEMO_DATA_LABEL,
  },
];

/** Individual invite records are the supported outreach model; there are no campaigns. */
export const DEMO_ANNOUNCEMENTS: readonly DemoAnnouncement[] = [
  {
    id: "demo_announcement_fall_openings",
    organizationId: DEMO_ORGANIZATION_ID,
    authorId: DEMO_OWNER_ID,
    status: "published",
    title: "Fall roles are open",
    body: "Guest services, waterfront, and kitchen openings now include full season dates plus housing, meals, and pay details.",
    createdAt: "2026-08-01T15:00:00.000Z",
    publishedAt: "2026-08-01T16:00:00.000Z",
    demoLabel: DEMO_DATA_LABEL,
  },
  {
    id: "demo_announcement_winter_preview",
    organizationId: DEMO_ORGANIZATION_ID,
    authorId: DEMO_OWNER_ID,
    status: "draft",
    title: "Winter retreat season preview",
    body: "A smaller winter crew is planned while the final operating calendar is confirmed.",
    createdAt: "2026-08-04T19:10:00.000Z",
    publishedAt: null,
    demoLabel: DEMO_DATA_LABEL,
  },
];

export const DEMO_MATCHES: readonly DemoMatch[] = [
  demoMatch(
    "demo_match_priya_guest_services",
    DEMO_CURRENT_SEEKER_ID,
    DEMO_ROLE_IDS.guestServices,
    {
      categoryRoleFit: 92,
      locationTravelFit: 90,
      availabilityOverlap: 96,
      payAlignment: 88,
      housingMealsFit: 100,
      profileCompleteness: 95,
    },
    94,
  ),
  demoMatch(
    "demo_match_priya_waterfront",
    DEMO_CURRENT_SEEKER_ID,
    DEMO_ROLE_IDS.waterfrontGuide,
    {
      categoryRoleFit: 96,
      locationTravelFit: 90,
      availabilityOverlap: 92,
      payAlignment: 94,
      housingMealsFit: 100,
      profileCompleteness: 95,
    },
    94,
  ),
  demoMatch(
    "demo_match_priya_kitchen",
    DEMO_CURRENT_SEEKER_ID,
    DEMO_ROLE_IDS.kitchenAssistant,
    {
      categoryRoleFit: 72,
      locationTravelFit: 90,
      availabilityOverlap: 98,
      payAlignment: 85,
      housingMealsFit: 90,
      profileCompleteness: 95,
    },
    91,
  ),
];

export const DEMO_WEATHER: DemoWeatherContext = {
  id: "demo_weather_sandpoint_ten_day",
  locationId: DEMO_LOCATION_ID,
  generatedAt: DEMO_NOW,
  dataKind: "illustrative_demo_forecast",
  disclosure:
    "Illustrative demo forecast, not live weather. A configured production provider supplies current conditions.",
  days: [
    { id: "demo_weather_day_2026_08_05", date: "2026-08-05", condition: "Sunny", highF: 82, lowF: 53 },
    { id: "demo_weather_day_2026_08_06", date: "2026-08-06", condition: "Mostly sunny", highF: 84, lowF: 55 },
    { id: "demo_weather_day_2026_08_07", date: "2026-08-07", condition: "Partly cloudy", highF: 80, lowF: 54 },
    { id: "demo_weather_day_2026_08_08", date: "2026-08-08", condition: "Light showers", highF: 72, lowF: 50 },
    { id: "demo_weather_day_2026_08_09", date: "2026-08-09", condition: "Partly cloudy", highF: 76, lowF: 51 },
    { id: "demo_weather_day_2026_08_10", date: "2026-08-10", condition: "Sunny", highF: 81, lowF: 52 },
    { id: "demo_weather_day_2026_08_11", date: "2026-08-11", condition: "Mostly sunny", highF: 83, lowF: 54 },
    { id: "demo_weather_day_2026_08_12", date: "2026-08-12", condition: "Cloudy", highF: 75, lowF: 52 },
    { id: "demo_weather_day_2026_08_13", date: "2026-08-13", condition: "Partly cloudy", highF: 78, lowF: 51 },
    { id: "demo_weather_day_2026_08_14", date: "2026-08-14", condition: "Sunny", highF: 82, lowF: 53 },
  ],
};

export const DEMO_BILLING: DemoBilling = {
  id: "demo_billing_juniper_wake",
  organizationId: DEMO_ORGANIZATION_ID,
  mode: "demo_only_no_customer",
  planTier: "enterprise",
  planName: "Enterprise",
  interval: "monthly",
  priceCents: FOUNDER_LOCKED_PRICING.enterprise.monthly,
  entitlements: PLAN_ENTITLEMENTS.enterprise,
  note: "Sample plan presentation only. No Stripe customer, payment method, invoice, or renewal exists for this fictional account.",
  demoLabel: DEMO_DATA_LABEL,
};

export const DEFAULT_DEMO_SESSION_STATE: DemoSessionState = {
  schemaVersion: 1,
  listingDecisions: {
    [DEMO_ROLE_IDS.guestServices]: "applied",
    [DEMO_ROLE_IDS.kitchenAssistant]: "saved",
  },
  readNotificationIds: DEMO_NOTIFICATIONS.filter(
    (notification) =>
      notification.recipientId === DEMO_CURRENT_SEEKER_ID && notification.readAt !== null,
  ).map((notification) => notification.id),
  openedConversationId: null,
  messageDrafts: {},
};

export function createDefaultDemoSessionState(): DemoSessionState {
  return {
    schemaVersion: DEFAULT_DEMO_SESSION_STATE.schemaVersion,
    listingDecisions: { ...DEFAULT_DEMO_SESSION_STATE.listingDecisions },
    readNotificationIds: [...DEFAULT_DEMO_SESSION_STATE.readNotificationIds],
    openedConversationId: DEFAULT_DEMO_SESSION_STATE.openedConversationId,
    messageDrafts: { ...DEFAULT_DEMO_SESSION_STATE.messageDrafts },
  };
}

interface HostSummaryInput {
  readonly roles: readonly DemoRole[];
  readonly applications: readonly DemoApplication[];
  readonly interviews: readonly DemoInterview[];
  readonly conversations: readonly DemoConversation[];
  readonly invites: readonly DemoInvite[];
  readonly announcements: readonly DemoAnnouncement[];
  readonly organization: DemoHostOrganization;
  readonly ownerId: DemoId;
  readonly now: string;
}

export function deriveDemoHostSummary(input: HostSummaryInput): DemoHostSummary {
  const currentMonth = input.now.slice(0, 7);
  return {
    roles: deriveDemoRoleCounts(input.roles),
    applicationsByStage: deriveDemoApplicationStageCounts(input.applications),
    applicationsTotal: input.applications.length,
    upcomingInterviews: input.interviews.filter(
      (interview) => interview.status === "selected" && interview.startsAt > input.now,
    ).length,
    offersAwaitingResponse: input.applications.filter(
      (application) => application.status === "offered",
    ).length,
    unreadConversationCount: unreadConversationCount(input.conversations, input.ownerId),
    profileCompletion: profileCompletion(input.organization.profileChecklist),
    invitesUsedThisMonth: input.invites.filter((invite) =>
      invite.sentAt.startsWith(currentMonth),
    ).length,
    announcementsUsedThisMonth: input.announcements.filter(
      (announcement) =>
        announcement.publishedAt !== null &&
        announcement.publishedAt.startsWith(currentMonth),
    ).length,
  };
}

interface SeekerSummaryInput {
  readonly seeker: DemoSeeker;
  readonly roles: readonly DemoRole[];
  readonly applications: readonly DemoApplication[];
  readonly interviews: readonly DemoInterview[];
  readonly conversations: readonly DemoConversation[];
  readonly notifications: readonly DemoNotification[];
  readonly matches: readonly DemoMatch[];
  readonly now: string;
}

export function deriveDemoSeekerSummary(input: SeekerSummaryInput): DemoSeekerSummary {
  const seekerApplicationIds = new Set(
    input.applications
      .filter((application) => application.seekerId === input.seeker.id)
      .map((application) => application.id),
  );
  const activeRoleIds = new Set(
    input.roles.filter((role) => role.status === "live").map((role) => role.id),
  );
  return {
    savedRoles: input.seeker.savedRoleIds.length,
    applications: seekerApplicationIds.size,
    upcomingInterviews: input.interviews.filter(
      (interview) =>
        seekerApplicationIds.has(interview.applicationId) &&
        interview.status === "selected" &&
        interview.startsAt > input.now,
    ).length,
    unreadNotifications: input.notifications.filter(
      (notification) =>
        notification.recipientId === input.seeker.id && notification.readAt === null,
    ).length,
    unreadConversationCount: unreadConversationCount(input.conversations, input.seeker.id),
    recommendations: input.matches.filter(
      (match) => match.seekerId === input.seeker.id && activeRoleIds.has(match.roleId),
    ).length,
    profileCompletion: profileCompletion(input.seeker.profileChecklist),
  };
}

const DEMO_HOST_SUMMARY = deriveDemoHostSummary({
  roles: DEMO_ROLES,
  applications: DEMO_APPLICATIONS,
  interviews: DEMO_INTERVIEWS,
  conversations: DEMO_CONVERSATIONS,
  invites: DEMO_INVITES,
  announcements: DEMO_ANNOUNCEMENTS,
  organization: DEMO_ORGANIZATION,
  ownerId: DEMO_OWNER_ID,
  now: DEMO_NOW,
});

const DEMO_SEEKER_SUMMARY = deriveDemoSeekerSummary({
  seeker: DEMO_CURRENT_SEEKER,
  roles: DEMO_ROLES,
  applications: DEMO_APPLICATIONS,
  interviews: DEMO_INTERVIEWS,
  conversations: DEMO_CONVERSATIONS,
  notifications: DEMO_NOTIFICATIONS,
  matches: DEMO_MATCHES,
  now: DEMO_NOW,
});

export const DEMO_SCENARIO: FullFidelityDemoScenario = {
  schemaVersion: 1,
  now: DEMO_NOW,
  disclosure: DEMO_DISCLOSURE,
  organization: DEMO_ORGANIZATION,
  locations: DEMO_LOCATIONS,
  team: DEMO_TEAM,
  roles: DEMO_ROLES,
  currentSeeker: DEMO_CURRENT_SEEKER,
  candidates: DEMO_CANDIDATES,
  applications: DEMO_APPLICATIONS,
  interviews: DEMO_INTERVIEWS,
  conversations: DEMO_CONVERSATIONS,
  notifications: DEMO_NOTIFICATIONS,
  invites: DEMO_INVITES,
  announcements: DEMO_ANNOUNCEMENTS,
  matches: DEMO_MATCHES,
  weather: DEMO_WEATHER,
  billing: DEMO_BILLING,
  summaries: {
    host: DEMO_HOST_SUMMARY,
    seeker: DEMO_SEEKER_SUMMARY,
  },
  initialSessionState: DEFAULT_DEMO_SESSION_STATE,
};
