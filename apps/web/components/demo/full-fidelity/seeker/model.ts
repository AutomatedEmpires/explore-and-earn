import {
  DEMO_APPLICATIONS,
  DEMO_ANNOUNCEMENTS,
  DEMO_CONVERSATIONS,
  DEMO_CURRENT_SEEKER,
  DEMO_INTERVIEWS,
  DEMO_LOCATIONS,
  DEMO_MATCHES,
  DEMO_NOTIFICATIONS,
  DEMO_NOW,
  DEMO_ORGANIZATION,
  DEMO_ROLES,
  DEMO_TEAM,
  DEMO_WEATHER,
  type DemoConversation,
  type DemoNotification,
  type DemoPhoto,
  type DemoRole,
  type DemoWorkHistoryItem,
} from "../scenario";

import { getSitePhoto } from "../../../../lib/sitePhotos";
import { formatDate as formatDisplayDate } from "../../../../lib/format";

export interface SeekerDemoHost {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly location: string;
  readonly tagline: string;
  readonly story: string;
  readonly mission: string;
  readonly managementApproach: string;
  readonly culture: readonly string[];
  readonly training: readonly string[];
  readonly seasonRhythm: readonly string[];
  readonly logoUrl: string | null;
  readonly coverImageUrl: string | null;
  readonly verified: boolean;
  readonly hostSince: string;
  readonly team: readonly DemoTeamMember[];
  readonly locations: readonly string[];
  readonly primaryLocation: SeekerDemoLocation;
  readonly faqs: readonly { readonly id: string; readonly question: string; readonly answer: string }[];
  readonly benefits: readonly string[];
}

export interface SeekerDemoLocation {
  readonly name: string;
  readonly locality: string;
  readonly region: string;
  readonly timeZone: string;
  readonly summary: string;
  readonly remoteness: string;
  readonly transportation: readonly string[];
  readonly nearbyServices: readonly string[];
  readonly activities: readonly string[];
}

export interface DemoTeamMember {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly bio: string;
}

export interface SeekerDemoPerson {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly location: string;
  readonly intro: string;
  readonly openTo: string;
  readonly profileScore: number;
  readonly skills: readonly string[];
  readonly certifications: readonly string[];
  readonly workHistory: readonly SeekerDemoWorkHistory[];
  readonly availability: string;
  readonly preferences: readonly string[];
  readonly housingNeeded: boolean;
  readonly transportation: string;
  readonly optionalFieldsRemaining: readonly string[];
}

export interface SeekerDemoWorkHistory {
  readonly id: string;
  readonly organization: string;
  readonly role: string;
  readonly location: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly highlights: readonly string[];
}

export interface SeekerDemoPhotoCategories {
  readonly workplace: string;
  readonly housing: string;
  readonly meals: string;
  readonly location: string;
}

export interface SeekerDemoHousingDetails {
  readonly provision: SeekerDemoListing["housingProvision"];
  readonly summary: string;
  readonly type: string;
  readonly costCents: number;
  readonly costUnit: string;
  readonly occupancy: string;
  readonly distanceFromWork: string;
  readonly availability: string;
  readonly amenities: readonly string[];
  readonly utilities: readonly string[];
  readonly rules: readonly string[];
}

export interface SeekerDemoMealsDetails {
  readonly provision: SeekerDemoListing["mealsProvision"];
  readonly summary: string;
  readonly costCents: number;
  readonly costUnit: string;
  readonly style: string;
  readonly included: readonly string[];
  readonly dietaryAccommodations: readonly string[];
}

export interface SeekerDemoPayDetails {
  readonly provision: SeekerDemoListing["payProvision"];
  readonly summary: string;
  readonly minimumCents: number;
  readonly maximumCents: number;
  readonly unit: string;
  readonly currency: string;
  readonly estimatedHoursPerWeek: string;
  readonly additionalCompensation: readonly string[];
}

export interface SeekerDemoListing {
  readonly id: string;
  readonly title: string;
  readonly category: "farm" | "maritime" | "remote" | "seasonal" | "mix";
  readonly status: string;
  readonly location: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly deadline: string;
  readonly pay: string;
  readonly housing: string;
  readonly meals: string;
  readonly housingProvision: "provided" | "partial" | "not_provided" | "not_stated";
  readonly mealsProvision: "provided" | "partial" | "not_provided" | "not_stated";
  readonly payProvision: "provided" | "partial" | "not_provided" | "not_stated";
  readonly matchScore: number;
  readonly summary: string;
  readonly description: string;
  readonly responsibilities: readonly string[];
  readonly requirements: readonly string[];
  readonly training: readonly string[];
  readonly benefits: readonly string[];
  readonly openPositions: number;
  readonly photos: readonly string[];
  readonly photoCategories: SeekerDemoPhotoCategories;
  readonly housingDetails: SeekerDemoHousingDetails;
  readonly mealsDetails: SeekerDemoMealsDetails;
  readonly payDetails: SeekerDemoPayDetails;
  readonly locationDetails: SeekerDemoLocation;
  readonly hostId: string;
}

export interface SeekerDemoApplication {
  readonly id: string;
  readonly seekerId: string;
  readonly listingId: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly updatedAt: string;
}

export interface SeekerDemoMessage {
  readonly id: string;
  readonly sender: "seeker" | "host";
  readonly senderName: string;
  readonly body: string;
  readonly sentAt: string;
}

export interface SeekerDemoThread {
  readonly id: string;
  readonly listingId: string;
  readonly subject: string;
  readonly hostName: string;
  readonly unread: boolean;
  readonly messages: readonly SeekerDemoMessage[];
}

export interface SeekerDemoNotification {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly kind: string;
  readonly href: string;
  readonly read: boolean;
}

export interface SeekerDemoInterview {
  readonly id: string;
  readonly applicationId: string;
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly format: string;
  readonly notes: string;
}

export interface SeekerDemoWeatherDay {
  readonly id: string;
  readonly date: string;
  readonly condition: string;
  readonly highF: number;
  readonly lowF: number;
}

export interface SeekerDemoAnnouncement {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly publishedAt: string;
  readonly hostName: string;
}

function photoPath(photo: DemoPhoto): string {
  return getSitePhoto(photo.photoSlug).sizes.card.src;
}

function normalizeLocation(location: (typeof DEMO_LOCATIONS)[number] | undefined): SeekerDemoLocation {
  return location ? {
    name: location.name,
    locality: location.locality,
    region: location.region,
    timeZone: location.timeZone,
    summary: location.summary,
    remoteness: location.remoteness,
    transportation: location.transportation,
    nearbyServices: location.nearbyServices,
    activities: location.activities,
  } : {
    name: "Location not stated",
    locality: "",
    region: "",
    timeZone: "UTC",
    summary: "The host has not stated a location summary.",
    remoteness: "Remoteness not stated.",
    transportation: [],
    nearbyServices: [],
    activities: [],
  };
}

function roleLocation(role: DemoRole): string {
  const location = DEMO_LOCATIONS.find((entry) => entry.id === role.locationId);
  return location
    ? `${location.name} · ${location.locality}, ${location.region}`
    : "Location not stated";
}

function rolePhotoCategories(role: DemoRole): SeekerDemoPhotoCategories {
  const locationPhoto = DEMO_ORGANIZATION.gallery.find((photo) => photo.slot === "location")
    ?? DEMO_ORGANIZATION.coverPhoto;
  return {
    workplace: photoPath(role.coverPhoto),
    housing: photoPath(DEMO_ORGANIZATION.housingLibrary[0] ?? DEMO_ORGANIZATION.coverPhoto),
    meals: photoPath(role.meals.photos[0] ?? DEMO_ORGANIZATION.coverPhoto),
    location: photoPath(locationPhoto),
  };
}

function seekerProfileScore(): number {
  const total = DEMO_CURRENT_SEEKER.profileChecklist.reduce((sum, item) => sum + item.weight, 0);
  if (total === 0) return 0;
  const complete = DEMO_CURRENT_SEEKER.profileChecklist
    .filter((item) => item.complete)
    .reduce((sum, item) => sum + item.weight, 0);
  return Math.round(complete / total * 100);
}

const organizationLocations = DEMO_LOCATIONS.filter((location) =>
  DEMO_ORGANIZATION.locationIds.includes(location.id),
);
const organizationTeam = DEMO_TEAM.filter((member) =>
  DEMO_ORGANIZATION.teamMemberIds.includes(member.id),
);
const primaryOrganizationLocation = normalizeLocation(organizationLocations[0]);

export const seekerDemoHost: SeekerDemoHost = {
  id: DEMO_ORGANIZATION.id,
  name: DEMO_ORGANIZATION.name,
  category: DEMO_ORGANIZATION.category,
  location: organizationLocations[0]
    ? `${organizationLocations[0].locality}, ${organizationLocations[0].region}`
    : "Location not stated",
  tagline: DEMO_ORGANIZATION.tagline,
  story: DEMO_ORGANIZATION.story.join("\n\n"),
  mission: DEMO_ORGANIZATION.mission,
  managementApproach: DEMO_ORGANIZATION.managementApproach,
  culture: DEMO_ORGANIZATION.culture,
  training: DEMO_ORGANIZATION.training,
  seasonRhythm: DEMO_ORGANIZATION.seasonRhythm,
  logoUrl: null,
  coverImageUrl: photoPath(DEMO_ORGANIZATION.coverPhoto),
  verified: DEMO_ORGANIZATION.verified,
  hostSince: DEMO_ORGANIZATION.hostSince,
  team: organizationTeam.map((member) => ({
    id: member.id,
    name: member.name,
    initials: member.initials,
    role: member.title,
    bio: member.summary,
  })),
  locations: organizationLocations.map((location) => `${location.name} · ${location.locality}, ${location.region}`),
  primaryLocation: primaryOrganizationLocation,
  faqs: DEMO_ORGANIZATION.faqs,
  benefits: [...new Set(DEMO_ROLES.flatMap((role) => role.benefits))],
};

export const seekerDemoPerson: SeekerDemoPerson = {
  id: DEMO_CURRENT_SEEKER.id,
  name: DEMO_CURRENT_SEEKER.name,
  initials: DEMO_CURRENT_SEEKER.initials,
  location: DEMO_CURRENT_SEEKER.homeBase,
  intro: DEMO_CURRENT_SEEKER.introduction,
  openTo: DEMO_CURRENT_SEEKER.openToStatement,
  profileScore: seekerProfileScore(),
  skills: DEMO_CURRENT_SEEKER.skills,
  certifications: DEMO_CURRENT_SEEKER.certifications,
  workHistory: DEMO_CURRENT_SEEKER.workHistory.map((item: DemoWorkHistoryItem) => ({ ...item })),
  availability: `${formatDemoDate(DEMO_CURRENT_SEEKER.availability.beginsOn)} through ${formatDemoDate(DEMO_CURRENT_SEEKER.availability.endsOn)}`,
  preferences: [
    ...DEMO_CURRENT_SEEKER.preferences.seasons,
    ...DEMO_CURRENT_SEEKER.preferences.locations,
    DEMO_CURRENT_SEEKER.preferences.housing,
    DEMO_CURRENT_SEEKER.preferences.meals,
  ],
  housingNeeded: /needed|required|provided/i.test(DEMO_CURRENT_SEEKER.preferences.housing),
  transportation: DEMO_CURRENT_SEEKER.transportation.join(" · "),
  optionalFieldsRemaining: DEMO_CURRENT_SEEKER.optionalFieldsRemaining,
};

export const seekerDemoListings: readonly SeekerDemoListing[] = DEMO_ROLES
  .filter((role) => role.status === "live")
  .map((role) => {
    const photoCategories = rolePhotoCategories(role);
    const location = DEMO_LOCATIONS.find((entry) => entry.id === role.locationId);
    return {
    id: role.id,
    title: role.title,
    category: role.category,
    status: role.status,
    location: roleLocation(role),
    startDate: role.season.beginsOn,
    endDate: role.season.endsOn,
    deadline: role.season.applicationDeadline ?? role.season.endsOn,
    pay: role.pay.summary,
    housing: role.housing.summary,
    meals: role.meals.summary,
    housingProvision: role.housing.provision,
    mealsProvision: role.meals.provision,
    payProvision: role.pay.provision,
    matchScore: DEMO_MATCHES.find((match) =>
      match.seekerId === DEMO_CURRENT_SEEKER.id && match.roleId === role.id,
    )?.score ?? 0,
    summary: role.summary,
    description: role.description.join("\n\n"),
    responsibilities: role.responsibilities,
    requirements: role.requirements,
    training: role.training,
    benefits: role.benefits,
    openPositions: role.openPositions,
    photos: [photoCategories.workplace, photoCategories.housing, photoCategories.meals, photoCategories.location],
    photoCategories,
    housingDetails: { ...role.housing },
    mealsDetails: { ...role.meals },
    payDetails: { ...role.pay },
    locationDetails: normalizeLocation(location),
    hostId: role.organizationId,
    };
  });

export const seekerDemoApplications: readonly SeekerDemoApplication[] = DEMO_APPLICATIONS
  .filter((application) => application.seekerId === DEMO_CURRENT_SEEKER.id)
  .map((application) => ({
    id: application.id,
    seekerId: application.seekerId,
    listingId: application.roleId,
    status: application.status,
    submittedAt: application.submittedAt,
    updatedAt: application.statusChangedAt,
  }));

const seekerApplicationIds = new Set(seekerDemoApplications.map((application) => application.id));

function conversationForSeeker(conversation: DemoConversation): boolean {
  return conversation.participantIds.includes(DEMO_CURRENT_SEEKER.id)
    && seekerApplicationIds.has(conversation.applicationId);
}

export const seekerDemoThreads: readonly SeekerDemoThread[] = DEMO_CONVERSATIONS
  .filter(conversationForSeeker)
  .map((conversation) => {
    const last = conversation.messages.at(-1);
    return {
      id: conversation.id,
      listingId: conversation.roleId,
      subject: conversation.subject,
      hostName: DEMO_ORGANIZATION.name,
      unread: Boolean(last && !last.readByParticipantIds.includes(DEMO_CURRENT_SEEKER.id)),
      messages: conversation.messages.map((message) => {
        const fromSeeker = message.senderId === DEMO_CURRENT_SEEKER.id;
        const sender = organizationTeam.find((member) => member.id === message.senderId);
        return {
          id: message.id,
          sender: fromSeeker ? "seeker" as const : "host" as const,
          senderName: fromSeeker ? DEMO_CURRENT_SEEKER.name : sender?.name ?? DEMO_ORGANIZATION.name,
          body: message.body,
          sentAt: message.sentAt,
        };
      }),
    };
  });

function notificationHref(notification: DemoNotification): string {
  if (notification.kind === "interview") return "/for-seekers/demo/schedule";
  if (notification.kind === "message" && notification.conversationId) {
    return `/for-seekers/demo/messages/${notification.conversationId}`;
  }
  if (notification.applicationId) return `/for-seekers/demo/applications/${notification.applicationId}`;
  if (notification.roleId) return `/for-seekers/demo/listing/${notification.roleId}`;
  return "/for-seekers/demo";
}

export const seekerDemoNotifications: readonly SeekerDemoNotification[] = DEMO_NOTIFICATIONS
  .filter((notification) => notification.recipientId === DEMO_CURRENT_SEEKER.id)
  .map((notification) => ({
    id: notification.id,
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt,
    kind: notification.kind,
    href: notificationHref(notification),
    read: notification.readAt !== null,
  }));

export const seekerDemoInterviews: readonly SeekerDemoInterview[] = DEMO_INTERVIEWS
  .filter((interview) => seekerApplicationIds.has(interview.applicationId))
  .map((interview) => ({
    id: interview.id,
    applicationId: interview.applicationId,
    startsAt: interview.startsAt,
    durationMinutes: Math.max(
      15,
      Math.round((new Date(interview.endsAt).getTime() - new Date(interview.startsAt).getTime()) / 60_000),
    ),
    format: interview.meetingType.replaceAll("_", " "),
    notes: interview.agenda.join(" · "),
  }));

export const seekerDemoInitialSavedIds = DEMO_CURRENT_SEEKER.savedRoleIds.filter((roleId) =>
  seekerDemoListings.some((listing) => listing.id === roleId),
);

export const seekerDemoWeatherDisclosure = DEMO_WEATHER.disclosure;
export const seekerDemoWeatherDays: readonly SeekerDemoWeatherDay[] = DEMO_WEATHER.days;
export const seekerDemoAnnouncements: readonly SeekerDemoAnnouncement[] = DEMO_ANNOUNCEMENTS
  .filter((announcement) => announcement.status === "published" && announcement.publishedAt)
  .map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    publishedAt: announcement.publishedAt ?? DEMO_NOW,
    hostName: DEMO_ORGANIZATION.name,
  }));
export const seekerDemoNow = new Date(DEMO_NOW);

export function listingById(id: string | undefined): SeekerDemoListing | undefined {
  return id ? seekerDemoListings.find((listing) => listing.id === id) : seekerDemoListings[0];
}

export function applicationById(id: string | undefined): SeekerDemoApplication | undefined {
  return id ? seekerDemoApplications.find((application) => application.id === id) : seekerDemoApplications[0];
}

export function threadById(id: string | undefined): SeekerDemoThread | undefined {
  return id ? seekerDemoThreads.find((thread) => thread.id === id) : seekerDemoThreads[0];
}

export function formatDemoDate(
  iso: string,
  options?: Parameters<typeof formatDisplayDate>[1],
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const timeZone = dateOnly ? "UTC" : primaryOrganizationLocation.timeZone;
  return formatDisplayDate(
    iso,
    {
      ...(options ?? { month: "short", day: "numeric", year: "numeric" }),
      timeZone: options?.timeZone ?? timeZone,
    },
  );
}

export function seasonLength(listing: SeekerDemoListing): string {
  const start = new Date(listing.startDate);
  const end = new Date(listing.endDate);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const months = Math.max(1, Math.round(days / 30.44));
  return `about ${months} month${months === 1 ? "" : "s"}`;
}
