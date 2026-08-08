import { getSitePhoto } from "../../../../lib/sitePhotos";
import { formatDate, formatMoney } from "../../../../lib/format";
import type {
  HostRatingSummary,
  PublicHostListing,
  PublicHostProfile,
} from "@explore-and-earn/db";
import {
  APPLICATION_TRANSITIONS,
  canTransition,
  type ApplicationStatus,
} from "@explore-and-earn/contracts";
import { hostListingTransitions } from "../../../host/listingStatusTransitions";
import {
  DEMO_ANNOUNCEMENTS,
  DEMO_APPLICATIONS,
  DEMO_BILLING,
  DEMO_CANDIDATES,
  DEMO_CONVERSATIONS,
  DEMO_CURRENT_SEEKER,
  DEMO_INTERVIEWS,
  DEMO_INVITES,
  DEMO_LOCATIONS,
  DEMO_MATCHES,
  DEMO_NOTIFICATIONS,
  DEMO_NOW,
  DEMO_ORGANIZATION,
  DEMO_ROLES,
  DEMO_SCENARIO,
  DEMO_TEAM,
  DEMO_WEATHER,
} from "../scenario";

export type DemoApplicationStatus = ApplicationStatus;

export type HostDemoListingStatus =
  | "draft"
  | "ready"
  | "published"
  | "paused"
  | "closed"
  | "archived";

export interface HostDemoHost {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly tagline: string;
  readonly description: string;
  readonly mission: string;
  readonly website: string;
  readonly housing: string;
  readonly meals: string;
  readonly teamSize: string;
  readonly season: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

export interface HostDemoListing {
  readonly id: string;
  readonly title: string;
  readonly category: PublicHostListing["category"];
  readonly location: string;
  readonly summary: string;
  readonly description: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly seasonLength: string;
  readonly housing: string;
  readonly meals: string;
  readonly pay: string;
  readonly housingIncluded: boolean;
  readonly mealsIncluded: boolean;
  readonly compensationMinCents: number;
  readonly compensationMaxCents: number;
  readonly compensationUnit: string;
  readonly compensationCurrency: string;
  readonly publishedAt: string | null;
  readonly status: HostDemoListingStatus;
  readonly applications: number;
  readonly openPositions: number;
  readonly applicationDeadline: string;
  readonly applicationDeadlineDetail: string;
  readonly requirements: readonly string[];
  readonly responsibilities: readonly string[];
  readonly training: readonly string[];
  readonly highlights: readonly string[];
  /** Preview-only planning prompts; production currently collects one cover message. */
  readonly applicationQuestions: readonly string[];
  readonly housingDetails: {
    readonly provision: "provided" | "not_provided" | "not_stated";
    readonly type: string;
    readonly cost: string;
    readonly occupancy: string;
    readonly distanceFromWork: string;
    readonly availability: string;
    readonly amenities: readonly string[];
    readonly utilities: readonly string[];
    readonly rules: readonly string[];
  };
  readonly mealsDetails: {
    readonly provision: "provided" | "partial" | "not_provided" | "not_stated";
    readonly cost: string;
    readonly style: string;
    readonly included: readonly string[];
    readonly dietaryAccommodations: readonly string[];
  };
  readonly payDetails: {
    readonly estimatedHoursPerWeek: string;
    readonly additionalCompensation: readonly string[];
  };
  readonly media: readonly HostDemoProfilePhoto[];
  readonly filledPositions: number;
  readonly lifecycle: readonly HostDemoListingLifecycleEvent[];
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

export interface HostDemoListingLifecycleEvent {
  readonly id: string;
  readonly status: HostDemoListingStatus;
  readonly reason: string;
  readonly changedLabel: string;
}

export interface HostDemoListingCompletion {
  readonly score: number;
  readonly completeSections: number;
  readonly totalSections: number;
  readonly missing: readonly string[];
}

export interface HostDemoProfileCompletionInput {
  readonly tagline: string;
  readonly description: string;
  readonly whyWorkForUs: string;
  readonly team: string;
  readonly housing: string;
  readonly transportation: string;
  readonly remoteness: string;
  readonly nearbyServices: string;
  readonly faqs: string;
}

export interface HostDemoProfileCompletion {
  readonly score: number;
  readonly missing: readonly string[];
}

export interface HostDemoApplication {
  readonly id: string;
  readonly seekerId: string;
  readonly seekerName: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly status: DemoApplicationStatus;
  readonly match: number | null;
  readonly availability: string;
  readonly housingNeed: string;
  readonly mealsNeed: string;
  readonly appliedAt: string;
  readonly note: string;
  readonly statusReason: string | null;
  readonly bio: string;
  readonly coverNote: string;
  readonly skills: readonly string[];
  readonly homeBase: string;
  readonly certifications: readonly string[];
  readonly workHistory: readonly {
    readonly id: string;
    readonly organization: string;
    readonly role: string;
    readonly location: string;
    readonly dates: string;
    readonly highlights: readonly string[];
  }[];
}

export interface HostDemoMessage {
  readonly id: string;
  readonly sender: "host" | "seeker";
  readonly body: string;
  readonly sentAt: string;
}

export interface HostDemoThread {
  readonly id: string;
  readonly applicationId: string;
  readonly seekerName: string;
  readonly listingTitle: string;
  readonly unread: boolean;
  readonly updatedLabel: string;
  readonly messages: readonly HostDemoMessage[];
}

export interface HostDemoInterview {
  readonly id: string;
  readonly applicationId: string;
  readonly seekerName: string;
  readonly listingTitle: string;
  readonly startsAt: string;
  readonly format: string;
  readonly status: string;
}

export interface HostDemoInvite {
  readonly id: string;
  readonly seekerName: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly status: "delivered" | "viewed" | "applied";
  readonly sentAt: string;
  readonly expiresAt: string;
}

export interface HostDemoAnnouncement {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly createdLabel: string;
  readonly status: "draft" | "published";
}

export interface HostDemoNotification {
  readonly id: string;
  readonly kind: "application_status" | "interview" | "message";
  readonly title: string;
  readonly body: string;
  readonly createdLabel: string;
  readonly initiallyRead: boolean;
  readonly href: string;
}

export interface HostDemoApplicationAction {
  readonly label: string;
  readonly status: DemoApplicationStatus;
  readonly variant: "primary" | "secondary" | "ghost";
}

export interface HostDemoListingAction {
  readonly label: string;
  readonly status: HostDemoListingStatus;
  readonly variant: "primary" | "secondary";
}

export interface HostDemoProfilePhoto {
  readonly id: string;
  readonly label: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

/** Readiness is derived from seeker-visible facts; custom questions are not a live requirement. */
export function hostDemoListingCompleteness(
  listing: HostDemoListing,
): HostDemoListingCompletion {
  const housingAnswered = listing.housingDetails.provision === "not_provided" ||
    (listing.housingDetails.provision === "provided" && Boolean(listing.housing.trim() && listing.housingDetails.type.trim() && listing.housingDetails.cost.trim() && listing.housingDetails.occupancy.trim() && listing.housingDetails.availability.trim()));
  const mealsAnswered = listing.mealsDetails.provision === "not_provided" ||
    (listing.mealsDetails.provision !== "not_stated" && Boolean(listing.meals.trim() && listing.mealsDetails.style.trim() && listing.mealsDetails.cost.trim() && listing.mealsDetails.included.length > 0));
  const checks: readonly [string, boolean][] = [
    ["Role basics", Boolean(listing.title.trim() && listing.summary.trim() && listing.description.trim())],
    ["Season dates", hostDemoDateRangeError(listing.startDate, listing.endDate) === null],
    ["Open positions", listing.openPositions > 0],
    ["Responsibilities and requirements", listing.responsibilities.length > 0 && listing.requirements.length > 0],
    ["Housing answer", housingAnswered],
    ["Meals answer", mealsAnswered],
    ["Pay answer", listing.compensationMinCents > 0 && listing.compensationMaxCents >= listing.compensationMinCents && Boolean(listing.pay.trim() && listing.payDetails.estimatedHoursPerWeek.trim())],
    ["Training and benefits", listing.training.length > 0 && listing.highlights.length > 0],
    ["Media", listing.media.length > 0 && Boolean(listing.imageUrl)],
  ];
  const completeSections = checks.filter(([, complete]) => complete).length;
  return {
    score: Math.round((completeSections / checks.length) * 100),
    completeSections,
    totalSections: checks.length,
    missing: checks.flatMap(([label, complete]) => (complete ? [] : [label])),
  };
}

/** Production readiness gate: each value-triad answer must be explicit. */
export function hostDemoBenefitTriadReady(listing: HostDemoListing): boolean {
  return listing.housingDetails.provision !== "not_stated" &&
    listing.mealsDetails.provision !== "not_stated" &&
    listing.compensationMinCents > 0 &&
    listing.compensationMaxCents >= listing.compensationMinCents;
}

function completedLines(value: string): number {
  return value.split("\n").filter((line) => line.trim()).length;
}

function completedFaqs(value: string): number {
  return value.split("\n").filter((line) => {
    const [question, ...answerParts] = line.split("|");
    return Boolean(question?.trim() && answerParts.join("|").trim());
  }).length;
}

/** Weighted mirror of the scenario checklist, recalculated from session edits. */
export function hostDemoProfileCompletion(
  profile: HostDemoProfileCompletionInput,
): HostDemoProfileCompletion {
  const checks: readonly [string, number, boolean][] = [
    ["Identity and story", 20, Boolean(profile.tagline.trim() && profile.description.trim() && profile.whyWorkForUs.trim())],
    ["Location and transportation", 15, Boolean(profile.remoteness.trim() && completedLines(profile.transportation) > 0 && completedLines(profile.nearbyServices) > 0)],
    ["Housing details", 20, Boolean(profile.housing.trim())],
    ["Public team", 15, completedLines(profile.team) > 0],
    ["Workplace media", 20, hostDemoHousingPhotos.length >= 4],
    ["Add one more FAQ", 10, completedFaqs(profile.faqs) > (hostDemoPublicProfile.faqs?.length ?? 0)],
  ];
  return {
    score: checks.reduce((score, [, weight, complete]) => score + (complete ? weight : 0), 0),
    missing: checks.flatMap(([label, , complete]) => (complete ? [] : [label])),
  };
}

function dateLabel(value: string): string {
  return formatDate(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dateTimeLabel(value: string): string {
  return formatDate(value, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Boise",
    timeZoneName: "short",
  });
}

function relativeLabel(value: string): string {
  const difference = new Date(DEMO_NOW).getTime() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(difference / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  return `${Math.round(hours / 24)} d`;
}

function money(cents: number): string {
  return formatMoney(cents, {
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function hostDemoHourlyPaySummary(
  minimumCents: number,
  maximumCents: number,
): string {
  const normalizedMinimum = Math.max(0, minimumCents);
  const normalizedMaximum = Math.max(normalizedMinimum, maximumCents);
  const minimum = money(normalizedMinimum);
  const maximum = money(normalizedMaximum);
  return normalizedMinimum === normalizedMaximum
    ? `${minimum}/hr`
    : `${minimum}–${maximum}/hr`;
}

export function hostDemoSeasonLength(startsOn: string, endsOn: string): string {
  const rangeError = hostDemoDateRangeError(startsOn, endsOn);
  if (rangeError) return "Dates need review";
  const days = Math.max(
    1,
    Math.round(
      (new Date(endsOn).getTime() - new Date(startsOn).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );
  const months = Math.max(1, Math.round(days / 30.4));
  return `about ${months} month${months === 1 ? "" : "s"}`;
}

export function hostDemoDateRangeError(
  startsOn: string,
  endsOn: string,
): string | null {
  const start = Date.parse(startsOn);
  const end = Date.parse(endsOn);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "Add valid beginning and ending dates.";
  }
  if (end < start) {
    return "The ending date must be on or after the beginning date.";
  }
  return null;
}

function deadlineDetail(value: string | null): string {
  if (!value) return "No application deadline set";
  const days = Math.ceil(
    (new Date(`${value}T23:59:59.999Z`).getTime() - new Date(DEMO_NOW).getTime()) /
      (24 * 60 * 60 * 1000),
  );
  if (days < 0) return `Closed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Closes today";
  return `Closes in ${days} day${days === 1 ? "" : "s"}`;
}

function photo(photoSlug: string) {
  const source = getSitePhoto(photoSlug);
  return {
    imageUrl: source.sizes.card.src,
    imageAlt: `${source.alt} — illustrative demo scene`,
    imageWidth: source.sizes.card.width,
    imageHeight: source.sizes.card.height,
  };
}

const APPLICATION_ACTIONS: readonly HostDemoApplicationAction[] = [
  { label: "Mark reviewing", status: "reviewing", variant: "secondary" },
  { label: "Save applicant", status: "saved_by_host", variant: "secondary" },
  { label: "Make offer", status: "offered", variant: "primary" },
  { label: "Accept", status: "accepted", variant: "primary" },
  { label: "Start placement", status: "active", variant: "primary" },
  { label: "Mark completed", status: "completed", variant: "primary" },
  { label: "Not selected", status: "not_selected", variant: "ghost" },
];

/** Presentation-safe mirror of the canonical application lifecycle. */
export function hostDemoApplicationActions(
  status: DemoApplicationStatus,
): readonly HostDemoApplicationAction[] {
  return APPLICATION_ACTIONS.filter((action) =>
    canTransition(APPLICATION_TRANSITIONS, status, action.status),
  );
}

const CANONICAL_LISTING_STATUS = {
  draft: "draft",
  ready: "under_review",
  published: "live",
  paused: "paused",
  closed: "closed",
  archived: "archived",
} as const;

const DEMO_LISTING_STATUS = {
  draft: "draft",
  under_review: "ready",
  live: "published",
  paused: "paused",
  closed: "closed",
  archived: "archived",
} as const;

/** Presentation-safe mirror of the production listing transitions. */
export function hostDemoListingActions(
  status: HostDemoListingStatus,
): readonly HostDemoListingAction[] {
  return hostListingTransitions(CANONICAL_LISTING_STATUS[status]).map((transition) => ({
    label: transition.label,
    status: DEMO_LISTING_STATUS[transition.target],
    variant: transition.variant,
  }));
}

const location = DEMO_LOCATIONS[0];
const referenceRole = DEMO_ROLES.find((role) => role.status === "live") ?? DEMO_ROLES[0];
const firstSeason = [...DEMO_ROLES]
  .filter((role) => role.status === "live")
  .sort((a, b) => a.season.beginsOn.localeCompare(b.season.beginsOn))[0]?.season;
const lastSeason = [...DEMO_ROLES]
  .filter((role) => role.status === "live")
  .sort((a, b) => b.season.endsOn.localeCompare(a.season.endsOn))[0]?.season;
const organizationPhoto = photo(DEMO_ORGANIZATION.coverPhoto.photoSlug);

export const hostDemoHost: HostDemoHost = {
  id: DEMO_ORGANIZATION.id,
  name: DEMO_ORGANIZATION.name,
  location: location
    ? `${location.locality}, ${location.region}`
    : "Location described in the sample profile",
  tagline: DEMO_ORGANIZATION.tagline,
  description: DEMO_ORGANIZATION.story.join(" "),
  mission: DEMO_ORGANIZATION.mission,
  website: DEMO_ORGANIZATION.category,
  housing: referenceRole?.housing.summary ?? "Not stated",
  meals: referenceRole?.meals.summary ?? "Not stated",
  teamSize: `${DEMO_TEAM.length} public team members`,
  season:
    firstSeason && lastSeason
      ? `${dateLabel(firstSeason.beginsOn)} through ${dateLabel(lastSeason.endsOn)}`
      : "Season dates vary by role",
  ...organizationPhoto,
};

export const hostDemoListings: readonly HostDemoListing[] = DEMO_ROLES.map((role) => {
  const roleLocation = DEMO_LOCATIONS.find((item) => item.id === role.locationId);
  return {
    id: role.id,
    title: role.title,
    category: role.category,
    location: roleLocation
      ? `${roleLocation.locality}, ${roleLocation.region}`
      : hostDemoHost.location,
    summary: role.summary,
    description: role.description.join(" "),
    startDate: dateLabel(role.season.beginsOn),
    endDate: dateLabel(role.season.endsOn),
    seasonLength: hostDemoSeasonLength(role.season.beginsOn, role.season.endsOn),
    housing: role.housing.summary,
    meals: role.meals.summary,
    pay: hostDemoHourlyPaySummary(role.pay.minimumCents, role.pay.maximumCents),
    housingIncluded: role.housing.provision === "provided",
    mealsIncluded:
      role.meals.provision === "provided" || role.meals.provision === "partial",
    compensationMinCents: role.pay.minimumCents,
    compensationMaxCents: role.pay.maximumCents,
    compensationUnit: role.pay.unit,
    compensationCurrency: role.pay.currency,
    publishedAt: role.publishedAt,
    status:
      role.status === "live"
        ? "published"
        : role.status === "draft"
          ? "draft"
          : "closed",
    applications: DEMO_APPLICATIONS.filter((application) => application.roleId === role.id).length,
    openPositions: role.openPositions,
    applicationDeadline: role.season.applicationDeadline
      ? dateLabel(role.season.applicationDeadline)
      : "No deadline",
    applicationDeadlineDetail: deadlineDetail(role.season.applicationDeadline),
    requirements: role.requirements,
    responsibilities: role.responsibilities,
    training: role.training,
    highlights: role.benefits,
    applicationQuestions: [],
    housingDetails: {
      provision: role.housing.provision,
      type: role.housing.type,
      cost: role.housing.costCents === 0 ? "No charge" : `${money(role.housing.costCents)}/${role.housing.costUnit}`,
      occupancy: role.housing.occupancy,
      distanceFromWork: role.housing.distanceFromWork,
      availability: role.housing.availability,
      amenities: role.housing.amenities,
      utilities: role.housing.utilities,
      rules: role.housing.rules,
    },
    mealsDetails: {
      provision: role.meals.provision,
      cost: role.meals.costCents === 0 ? "Included" : `${money(role.meals.costCents)}/${role.meals.costUnit}`,
      style: role.meals.style,
      included: role.meals.included,
      dietaryAccommodations: role.meals.dietaryAccommodations,
    },
    payDetails: {
      estimatedHoursPerWeek: role.pay.estimatedHoursPerWeek,
      additionalCompensation: role.pay.additionalCompensation,
    },
    media: [
      { id: role.coverPhoto.id, label: "Role cover", ...photo(role.coverPhoto.photoSlug) },
      ...role.meals.photos.map((item, index) => ({
        id: item.id,
        label: index === 0 ? "Staff meal" : "Meal setting",
        ...photo(item.photoSlug),
      })),
    ],
    filledPositions: role.status === "closed" ? role.openPositions : 0,
    lifecycle: role.closedAt
      ? [{
          id: `${role.id}_closed`,
          status: "closed" as const,
          reason: role.statusReason ?? "Closed with no additional reason recorded.",
          changedLabel: dateTimeLabel(role.closedAt),
        }]
      : [],
    ...photo(role.coverPhoto.photoSlug),
  };
});

const listingById = new Map(hostDemoListings.map((listing) => [listing.id, listing]));
const candidateById = new Map(DEMO_CANDIDATES.map((candidate) => [candidate.id, candidate]));
const matchByPair = new Map(
  DEMO_MATCHES.map((match) => [`${match.seekerId}:${match.roleId}`, match]),
);

export const hostDemoApplications: readonly HostDemoApplication[] = DEMO_APPLICATIONS.map(
  (application) => {
    const candidate = candidateById.get(application.seekerId);
    const listing = listingById.get(application.roleId);
    const match = matchByPair.get(`${application.seekerId}:${application.roleId}`);
    const isCurrentSeeker = application.seekerId === DEMO_CURRENT_SEEKER.id;
    return {
      id: application.id,
      seekerId: application.seekerId,
      seekerName: candidate?.name ?? "Fictional seeker",
      listingId: application.roleId,
      listingTitle: listing?.title ?? "Seasonal role",
      status: application.status,
      match: match?.score ?? null,
      availability: candidate
        ? `${dateLabel(candidate.availability.beginsOn)} – ${dateLabel(candidate.availability.endsOn)}`
        : "Not stated",
      housingNeed: isCurrentSeeker
        ? DEMO_CURRENT_SEEKER.preferences.housing
        : "Not stated",
      mealsNeed: isCurrentSeeker
        ? DEMO_CURRENT_SEEKER.preferences.meals
        : "Not stated",
      appliedAt: dateLabel(application.submittedAt),
      note: application.internalNote ?? "",
      statusReason: ["accepted", "active", "completed", "not_selected", "withdrawn", "expired"].includes(application.status)
        ? application.internalNote ?? `Application ended as ${application.status}.`
        : null,
      bio: candidate?.headline ?? application.coverNote,
      coverNote: application.coverNote,
      skills: candidate?.skills ?? [],
      homeBase: candidate?.homeBase ?? "Not recorded",
      certifications: isCurrentSeeker ? DEMO_CURRENT_SEEKER.certifications : [],
      workHistory: isCurrentSeeker
        ? DEMO_CURRENT_SEEKER.workHistory.map((item) => ({
            id: item.id,
            organization: item.organization,
            role: item.role,
            location: item.location,
            dates: `${dateLabel(item.startsOn)} – ${dateLabel(item.endsOn)}`,
            highlights: item.highlights,
          }))
        : [],
    };
  },
);

const applicationById = new Map(
  hostDemoApplications.map((application) => [application.id, application]),
);
const teamIds = new Set(DEMO_TEAM.map((member) => member.id));

export const hostDemoThreads: readonly HostDemoThread[] = DEMO_CONVERSATIONS.map(
  (conversation) => {
    const application = applicationById.get(conversation.applicationId);
    const latest = conversation.messages.at(-1);
    return {
      id: conversation.id,
      applicationId: conversation.applicationId,
      seekerName: application?.seekerName ?? "Fictional seeker",
      listingTitle:
        application?.listingTitle ??
        listingById.get(conversation.roleId)?.title ??
        "Seasonal role",
      unread: conversation.messages.some(
        (message) =>
          !teamIds.has(message.senderId) &&
          !message.readByParticipantIds.some((participantId) => teamIds.has(participantId)),
      ),
      updatedLabel: latest ? relativeLabel(latest.sentAt) : "No messages",
      messages: conversation.messages.map((message) => ({
        id: message.id,
        sender: teamIds.has(message.senderId) ? "host" : "seeker",
        body: message.body,
        sentAt: dateTimeLabel(message.sentAt),
      })),
    };
  },
);

export const hostDemoInterviews: readonly HostDemoInterview[] = DEMO_INTERVIEWS.map(
  (interview) => {
    const application = applicationById.get(interview.applicationId);
    return {
      id: interview.id,
      applicationId: interview.applicationId,
      seekerName: application?.seekerName ?? "Fictional seeker",
      listingTitle: application?.listingTitle ?? "Seasonal role",
      startsAt: dateTimeLabel(interview.startsAt),
      format:
        interview.meetingType === "video"
          ? "Video call"
          : interview.locationLabel,
      status: interview.status,
    };
  },
);

export const hostDemoInvites: readonly HostDemoInvite[] = DEMO_INVITES.map(
  (invite) => ({
    id: invite.id,
    seekerName: candidateById.get(invite.seekerId)?.name ?? "Fictional seeker",
    listingId: invite.roleId,
    listingTitle: listingById.get(invite.roleId)?.title ?? "Seasonal role",
    status: invite.status,
    sentAt: dateLabel(invite.sentAt),
    expiresAt: dateLabel(invite.expiresAt),
  }),
);

export const hostDemoAnnouncements: readonly HostDemoAnnouncement[] =
  DEMO_ANNOUNCEMENTS.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    createdLabel: dateLabel(announcement.createdAt),
    status: announcement.status,
  }));

const ownerId = DEMO_TEAM.find((member) => member.workspaceAccess === "owner")?.id;

export const hostDemoNotifications: readonly HostDemoNotification[] =
  DEMO_NOTIFICATIONS.filter((notification) => notification.recipientId === ownerId).map(
    (notification) => ({
      id: notification.id,
      kind: notification.kind as HostDemoNotification["kind"],
      title: notification.title,
      body: notification.body,
      createdLabel: relativeLabel(notification.createdAt),
      initiallyRead: notification.readAt !== null,
      href: notification.conversationId
        ? `/for-hosts/demo/messages/${notification.conversationId}`
        : notification.applicationId
          ? `/for-hosts/demo/applicants/${notification.applicationId}`
          : notification.roleId
            ? `/for-hosts/demo/listings/${notification.roleId}`
            : "/for-hosts/demo",
    }),
  );

const HOUSING_SLOT_LABEL: Record<string, string> = {
  sleeping_area: "Sleeping area",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  dining_common: "Dining and common area",
  misc: "Additional view",
};

export const hostDemoHousingPhotos: readonly HostDemoProfilePhoto[] =
  DEMO_ORGANIZATION.housingLibrary.map((item) => {
    const resolved = photo(item.photoSlug);
    return {
      id: item.id,
      label: HOUSING_SLOT_LABEL[item.slot] ?? item.slot,
      ...resolved,
    };
  });

export const hostDemoProfileDetails = {
  culture: DEMO_ORGANIZATION.culture,
  managementApproach: DEMO_ORGANIZATION.managementApproach,
  training: DEMO_ORGANIZATION.training,
  seasonRhythm: DEMO_ORGANIZATION.seasonRhythm,
  faqs: DEMO_ORGANIZATION.faqs,
  profileChecklist: DEMO_ORGANIZATION.profileChecklist,
} as const;

export const hostDemoPublicProfile: PublicHostProfile = {
  id: DEMO_ORGANIZATION.id,
  companyName: DEMO_ORGANIZATION.name,
  hostName: DEMO_TEAM.find((member) => member.workspaceAccess === "owner")?.name ?? null,
  tagline: DEMO_ORGANIZATION.tagline,
  about: DEMO_ORGANIZATION.story.join("\n\n"),
  primaryLocationName: hostDemoHost.location,
  photoUrl: organizationPhoto.imageUrl,
  websiteUrl: null,
  socialLinks: {},
  categoryScopes: [...new Set(DEMO_ROLES.map((role) => role.category))],
  housingOfferedGenerally: DEMO_ROLES.some((role) => role.housing.provision === "provided"),
  mealsOfferedGenerally: DEMO_ROLES.some(
    (role) => role.meals.provision === "provided" || role.meals.provision === "partial",
  ),
  verified: DEMO_ORGANIZATION.verified,
  createdAt: DEMO_ORGANIZATION.hostSince,
  whyWorkForUs: `${DEMO_ORGANIZATION.mission} ${DEMO_ORGANIZATION.managementApproach}`,
  team: DEMO_TEAM.map((member) => ({ name: member.name, role: member.title })),
  activities: location?.activities ? [...location.activities] : [],
  perks: [...new Set(DEMO_ROLES.flatMap((role) => role.benefits))],
  culture: [...DEMO_ORGANIZATION.culture],
  managementApproach: DEMO_ORGANIZATION.managementApproach,
  seasonRhythm: [...DEMO_ORGANIZATION.seasonRhythm],
  training: [...DEMO_ORGANIZATION.training],
  transportation: location ? [...location.transportation] : [],
  remoteness: location?.remoteness,
  nearbyServices: location ? [...location.nearbyServices] : [],
  housingDescription: referenceRole
    ? `${referenceRole.housing.summary}. ${referenceRole.housing.occupancy}; ${referenceRole.housing.distanceFromWork.toLowerCase()}. ${referenceRole.housing.availability}.`
    : undefined,
  mealsDescription: referenceRole
    ? `${referenceRole.meals.summary}. ${referenceRole.meals.style}. Included: ${referenceRole.meals.included.join(", ")}.`
    : undefined,
  faqs: DEMO_ORGANIZATION.faqs.map(({ question, answer }) => ({ question, answer })),
};

/** Public projection of the exact session listings a host currently has live. */
export function hostDemoPublicListingsFor(
  listings: readonly HostDemoListing[],
): readonly PublicHostListing[] {
  return listings
    .filter(
      (listing) =>
        listing.status === "published" &&
        hostDemoListings.some(
          (scenarioListing) =>
            scenarioListing.id === listing.id && scenarioListing.status === "published",
        ),
    )
    .map((listing) => ({
      id: listing.id,
      title: listing.title,
      category: listing.category,
      coverPhotoUrl: listing.imageUrl,
      locationDisplay: listing.location,
      latitude: null,
      longitude: null,
      housingIncluded: listing.housingIncluded,
      mealsIncluded: listing.mealsIncluded,
      compensationSummary: listing.pay,
      compensationMinCents: listing.compensationMinCents,
      compensationMaxCents: listing.compensationMaxCents,
      compensationUnit: listing.compensationUnit,
      compensationCurrency: listing.compensationCurrency,
      publishedAt: listing.publishedAt,
    }));
}

export const hostDemoPublicListings = hostDemoPublicListingsFor(hostDemoListings);

export const hostDemoRatingSummary: HostRatingSummary = {
  count: 0,
  average: 0,
  housingKeptPct: null,
  mealsKeptPct: null,
  payOnTimePct: null,
};

export const hostDemoTeam = DEMO_TEAM;
export const hostDemoLocation = location;
export const hostDemoWeather = DEMO_WEATHER;
export const hostDemoBilling = DEMO_BILLING;
export const hostDemoSummary = DEMO_SCENARIO.summaries.host;
export const hostDemoNow = dateTimeLabel(DEMO_NOW);

export function findHostDemoListing(id: string): HostDemoListing | undefined {
  return hostDemoListings.find((listing) => listing.id === id);
}

export function findHostDemoApplication(id: string): HostDemoApplication | undefined {
  return hostDemoApplications.find((application) => application.id === id);
}

export function findHostDemoThread(id: string): HostDemoThread | undefined {
  return hostDemoThreads.find((thread) => thread.id === id);
}
