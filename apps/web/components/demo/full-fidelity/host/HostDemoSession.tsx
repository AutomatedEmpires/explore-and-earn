"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  hostDemoApplications,
  hostDemoAnnouncements,
  hostDemoApplicationActions,
  hostDemoBenefitTriadReady,
  hostDemoHost,
  hostDemoInterviews,
  hostDemoListingActions,
  hostDemoListingCompleteness,
  hostDemoListings,
  hostDemoNotifications,
  hostDemoProfileCompletion,
  hostDemoProfileDetails,
  hostDemoPublicProfile,
  hostDemoSeasonLength,
  hostDemoThreads,
  hostDemoTeam,
  type DemoApplicationStatus,
  type HostDemoListing,
  type HostDemoMessage,
} from "./adapter";
import { DEFAULT_CURRENCY } from "../../../../lib/format";

const STORAGE_KEY = "ee_full_fidelity_host_demo_v3";

export interface DemoProfileDraft {
  readonly tagline: string;
  readonly description: string;
  readonly whyWorkForUs: string;
  readonly team: string;
  readonly activities: string;
  readonly perks: string;
  readonly housing: string;
  readonly meals: string;
  readonly culture: string;
  readonly managementApproach: string;
  readonly training: string;
  readonly seasonRhythm: string;
  readonly transportation: string;
  readonly remoteness: string;
  readonly nearbyServices: string;
  readonly faqs: string;
}

export type DemoEmailCadence = "immediate" | "daily" | "weekly" | "off";
export type DemoNotificationCategory =
  | "applications"
  | "offers_invites"
  | "messages"
  | "scheduling"
  | "matches"
  | "listing_lifecycle"
  | "account_progress";

export interface DemoCategoryPreference {
  readonly email: DemoEmailCadence;
  readonly push: "immediate" | "off";
  readonly inApp: "on" | "off";
}

export interface DemoNotificationSettings {
  readonly emailEnabled: boolean;
  readonly pushEnabled: boolean;
  readonly inAppEnabled: boolean;
  readonly categories: Readonly<Record<DemoNotificationCategory, DemoCategoryPreference>>;
  readonly quietHours: {
    readonly enabled: boolean;
    readonly start: string;
    readonly end: string;
    readonly timezone: string;
  };
}

export interface DemoAnnouncement {
  readonly id: string;
  readonly body: string;
  readonly createdLabel: string;
}

export interface HostDemoCreateListingInput {
  readonly title: string;
  readonly location: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly pay: string;
  readonly payMinimumCents: number;
  readonly payMaximumCents: number;
  readonly estimatedHoursPerWeek: string;
  readonly additionalCompensation: readonly string[];
  readonly housing: string;
  readonly housingProvision: HostDemoListing["housingDetails"]["provision"];
  readonly housingType: string;
  readonly housingCost: string;
  readonly housingOccupancy: string;
  readonly housingDistance: string;
  readonly housingAvailability: string;
  readonly housingAmenities: readonly string[];
  readonly housingUtilities: readonly string[];
  readonly housingRules: readonly string[];
  readonly meals: string;
  readonly mealsProvision: HostDemoListing["mealsDetails"]["provision"];
  readonly mealsStyle: string;
  readonly mealsCost: string;
  readonly mealsIncluded: readonly string[];
  readonly dietaryAccommodations: readonly string[];
  readonly summary: string;
  readonly description: string;
  readonly responsibilities: readonly string[];
  readonly requirements: readonly string[];
  readonly training: readonly string[];
  readonly highlights: readonly string[];
  readonly applicationQuestions: readonly string[];
  readonly applicationDeadline: string;
  readonly openPositions: number;
}

export interface DemoApplicantWorkspace {
  readonly privateNote: string;
  readonly scheduledFor: string;
  readonly interviewFormat: string;
  readonly interviewAgenda: string;
  readonly followUpDue: string;
  readonly followUpNote: string;
  readonly followUpComplete: boolean;
  readonly offerPay: string;
  readonly offerStartDate: string;
  readonly offerResponseBy: string;
  readonly offerSaved: boolean;
  readonly assigneeId: string;
  readonly teamComments: readonly {
    readonly id: string;
    readonly author: string;
    readonly body: string;
    readonly createdLabel: string;
  }[];
}

interface PersistedHostDemoState {
  readonly applicationStatuses: Readonly<Record<string, DemoApplicationStatus>>;
  readonly applicationStatusReasons: Readonly<Record<string, string>>;
  readonly applicantWorkspaces: Readonly<Record<string, DemoApplicantWorkspace>>;
  readonly replies: Readonly<Record<string, readonly HostDemoMessage[]>>;
  readonly createdListings: readonly HostDemoListing[];
  readonly listingOverrides: Readonly<Record<string, HostDemoListing>>;
  readonly profile: DemoProfileDraft;
  readonly announcements: readonly DemoAnnouncement[];
  readonly readNotificationIds: readonly string[];
  readonly readThreadIds: readonly string[];
  readonly notificationSettings: DemoNotificationSettings;
}

const DEFAULT_NOTIFICATION_SETTINGS: DemoNotificationSettings = {
  emailEnabled: true,
  pushEnabled: true,
  inAppEnabled: true,
  categories: {
    applications: { email: "immediate", push: "immediate", inApp: "on" },
    offers_invites: { email: "immediate", push: "immediate", inApp: "on" },
    messages: { email: "immediate", push: "immediate", inApp: "on" },
    scheduling: { email: "immediate", push: "immediate", inApp: "on" },
    matches: { email: "daily", push: "off", inApp: "on" },
    listing_lifecycle: { email: "immediate", push: "immediate", inApp: "on" },
    account_progress: { email: "weekly", push: "off", inApp: "on" },
  },
  quietHours: {
    enabled: true,
    start: "22:00",
    end: "07:00",
    timezone: "America/Boise",
  },
};

const DEFAULT_STATE: PersistedHostDemoState = {
  applicationStatuses: {},
  applicationStatusReasons: {},
  applicantWorkspaces: {},
  replies: {},
  createdListings: [],
  listingOverrides: {},
  profile: {
    tagline: hostDemoHost.tagline,
    description: hostDemoHost.description,
    whyWorkForUs: hostDemoPublicProfile.whyWorkForUs ?? "",
    team: (hostDemoPublicProfile.team ?? [])
      .map((member) => `${member.name} | ${member.role}`)
      .join("\n"),
    activities: (hostDemoPublicProfile.activities ?? []).join("\n"),
    perks: (hostDemoPublicProfile.perks ?? []).join("\n"),
    housing: hostDemoHost.housing,
    meals: hostDemoHost.meals,
    culture: hostDemoProfileDetails.culture.join("\n"),
    managementApproach: hostDemoProfileDetails.managementApproach,
    training: hostDemoProfileDetails.training.join("\n"),
    seasonRhythm: hostDemoProfileDetails.seasonRhythm.join("\n"),
    transportation: (hostDemoPublicProfile.transportation ?? []).join("\n"),
    remoteness: hostDemoPublicProfile.remoteness ?? "",
    nearbyServices: (hostDemoPublicProfile.nearbyServices ?? []).join("\n"),
    faqs: (hostDemoPublicProfile.faqs ?? [])
      .map((faq) => `${faq.question} | ${faq.answer}`)
      .join("\n"),
  },
  announcements: hostDemoAnnouncements.map((announcement) => ({
    id: announcement.id,
    body: `${announcement.title} — ${announcement.body}`,
    createdLabel: announcement.createdLabel,
  })),
  readNotificationIds: [],
  readThreadIds: [],
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
};

function readState(): PersistedHostDemoState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_STATE;
    }
    const candidate = parsed as Partial<PersistedHostDemoState>;
    return {
      applicationStatuses: candidate.applicationStatuses ?? {},
      applicationStatusReasons: candidate.applicationStatusReasons ?? {},
      applicantWorkspaces: candidate.applicantWorkspaces ?? {},
      replies: candidate.replies ?? {},
      createdListings: Array.isArray(candidate.createdListings)
        ? candidate.createdListings
        : [],
      listingOverrides: candidate.listingOverrides ?? {},
      profile: { ...DEFAULT_STATE.profile, ...(candidate.profile ?? {}) },
      announcements: Array.isArray(candidate.announcements)
        ? candidate.announcements
        : DEFAULT_STATE.announcements,
      readNotificationIds: Array.isArray(candidate.readNotificationIds)
        ? candidate.readNotificationIds
        : [],
      readThreadIds: Array.isArray(candidate.readThreadIds) ? candidate.readThreadIds : [],
      notificationSettings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...(candidate.notificationSettings ?? {}),
        categories: {
          ...DEFAULT_NOTIFICATION_SETTINGS.categories,
          ...(candidate.notificationSettings?.categories ?? {}),
        },
        quietHours: {
          ...DEFAULT_NOTIFICATION_SETTINGS.quietHours,
          ...(candidate.notificationSettings?.quietHours ?? {}),
        },
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(state: PersistedHostDemoState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Session persistence is a convenience. The walkthrough still works if a
    // browser blocks storage or runs out of quota.
  }
}

interface HostDemoSessionValue extends PersistedHostDemoState {
  readonly ready: boolean;
  readonly changeCount: number;
  readonly resetVersion: number;
  readonly listings: readonly HostDemoListing[];
  readonly unreadNotificationCount: number;
  readonly unreadMessageCount: number;
  readonly profileCompletion: ReturnType<typeof hostDemoProfileCompletion>;
  readonly statusFor: (applicationId: string) => DemoApplicationStatus;
  readonly transitionApplication: (
    applicationId: string,
    status: DemoApplicationStatus,
    reason?: string,
  ) => void;
  readonly applicationStatusReasonFor: (applicationId: string) => string | null;
  readonly applicantWorkspaceFor: (applicationId: string) => DemoApplicantWorkspace;
  readonly saveApplicantWorkspace: (
    applicationId: string,
    workspace: DemoApplicantWorkspace,
  ) => void;
  readonly listingFor: (listingId: string) => HostDemoListing | undefined;
  readonly transitionListing: (
    listingId: string,
    status: HostDemoListing["status"],
    reason?: string,
  ) => void;
  readonly markListingFilled: (listingId: string) => void;
  readonly updateListing: (listing: HostDemoListing) => void;
  readonly duplicateListing: (listingId: string) => string | null;
  readonly sendReply: (threadId: string, body: string) => void;
  readonly createDraft: (input: HostDemoCreateListingInput) => string;
  readonly saveProfile: (profile: DemoProfileDraft) => void;
  readonly addAnnouncement: (body: string) => void;
  readonly markNotificationRead: (notificationId: string) => void;
  readonly markAllNotificationsRead: () => void;
  readonly isNotificationRead: (notificationId: string) => boolean;
  readonly isThreadUnread: (threadId: string) => boolean;
  readonly markThreadRead: (threadId: string) => void;
  readonly saveNotificationSettings: (settings: DemoNotificationSettings) => void;
  readonly reset: () => void;
}

const HostDemoSessionContext = createContext<HostDemoSessionValue | null>(null);

function defaultApplicantWorkspace(applicationId: string): DemoApplicantWorkspace {
  const application = hostDemoApplications.find((item) => item.id === applicationId);
  const interview = hostDemoInterviews.find((item) => item.applicationId === applicationId);
  const listing = application
    ? hostDemoListings.find((item) => item.id === application.listingId)
    : undefined;
  return {
    privateNote: application?.note ?? "",
    scheduledFor: interview?.startsAt ?? "",
    interviewFormat: interview?.format ?? "Video call",
    interviewAgenda: interview ? "Availability\nRole expectations\nCandidate questions" : "",
    followUpDue: "",
    followUpNote: "",
    followUpComplete: false,
    offerPay: listing?.pay ?? "",
    offerStartDate: listing?.startDate ?? "",
    offerResponseBy: "",
    offerSaved: application?.status === "offered" || application?.status === "accepted",
    assigneeId: hostDemoTeam[0]?.id ?? "",
    teamComments: [],
  };
}

export function HostDemoSessionProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<PersistedHostDemoState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);

  useEffect(() => {
    setState(readState());
    setReady(true);
  }, []);

  const update = useCallback(
    (producer: (current: PersistedHostDemoState) => PersistedHostDemoState) => {
      setState((current) => {
        const next = producer(current);
        writeState(next);
        return next;
      });
    },
    [],
  );

  const statusFor = useCallback(
    (applicationId: string): DemoApplicationStatus =>
      state.applicationStatuses[applicationId] ??
      hostDemoApplications.find((application) => application.id === applicationId)?.status ??
      "applied",
    [state.applicationStatuses],
  );

  const transitionApplication = useCallback(
    (applicationId: string, status: DemoApplicationStatus, reason = "") => {
      update((current) => {
        const allowed = hostDemoApplicationActions(
          current.applicationStatuses[applicationId] ??
            hostDemoApplications.find((application) => application.id === applicationId)
              ?.status ??
            "applied",
        ).some((action) => action.status === status);
        if (!allowed || (status === "not_selected" && !reason.trim())) return current;
        const nextReasons = { ...current.applicationStatusReasons };
        if (reason.trim()) nextReasons[applicationId] = reason.trim();
        else delete nextReasons[applicationId];
        return {
          ...current,
          applicationStatuses: { ...current.applicationStatuses, [applicationId]: status },
          applicationStatusReasons: nextReasons,
        };
      });
    },
    [update],
  );

  const applicationStatusReasonFor = useCallback(
    (applicationId: string): string | null => {
      const application = hostDemoApplications.find((item) => item.id === applicationId);
      const currentStatus = state.applicationStatuses[applicationId] ?? application?.status;
      return state.applicationStatusReasons[applicationId] ??
        (currentStatus === application?.status ? application.statusReason : null) ??
        null;
    },
    [state.applicationStatuses, state.applicationStatusReasons],
  );

  const applicantWorkspaceFor = useCallback(
    (applicationId: string): DemoApplicantWorkspace =>
      state.applicantWorkspaces[applicationId] ?? defaultApplicantWorkspace(applicationId),
    [state.applicantWorkspaces],
  );

  const saveApplicantWorkspace = useCallback(
    (applicationId: string, workspace: DemoApplicantWorkspace) => {
      if (!hostDemoApplications.some((application) => application.id === applicationId)) return;
      update((current) => ({
        ...current,
        applicantWorkspaces: { ...current.applicantWorkspaces, [applicationId]: workspace },
      }));
    },
    [update],
  );

  const listings = useMemo(
    () => [
      ...state.createdListings,
      ...hostDemoListings.map((listing) => state.listingOverrides[listing.id] ?? listing),
    ],
    [state.createdListings, state.listingOverrides],
  );

  const listingFor = useCallback(
    (listingId: string): HostDemoListing | undefined =>
      listings.find((listing) => listing.id === listingId),
    [listings],
  );

  const transitionListing = useCallback(
    (listingId: string, status: HostDemoListing["status"], reason = "") => {
      update((current) => {
        const created = current.createdListings.find((listing) => listing.id === listingId);
        const source =
          current.listingOverrides[listingId] ??
          created ??
          hostDemoListings.find((listing) => listing.id === listingId);
        if (!source) return current;
        if (!hostDemoListingActions(source.status).some((action) => action.status === status)) {
          return current;
        }
        if (
          (status === "ready" || status === "published") &&
          (!hostDemoBenefitTriadReady(source) || hostDemoListingCompleteness(source).score < 100)
        ) {
          return current;
        }
        if (status === "published" && source.filledPositions >= source.openPositions) {
          return current;
        }
        const lifecycleReason = reason.trim() ||
          (status === "archived"
            ? "Archived by the host in this session-only walkthrough."
            : status === "draft" && source.status === "closed"
              ? "Reopened as a draft; the prior closure reason remains in the record."
              : `${status.charAt(0).toUpperCase()}${status.slice(1)} in this session-only walkthrough.`);
        const next = {
          ...source,
          status,
          publishedAt:
            status === "published"
              ? source.publishedAt ?? "2026-08-05T20:00:00.000Z"
              : source.publishedAt,
          lifecycle: [
            ...source.lifecycle,
            {
              id: `demo_listing_event_${Date.now()}`,
              status,
              reason: lifecycleReason,
              changedLabel: "Changed in this demo",
            },
          ],
        };
        if (created) {
          return {
            ...current,
            createdListings: current.createdListings.map((listing) =>
              listing.id === listingId ? next : listing,
            ),
          };
        }
        return {
          ...current,
          listingOverrides: { ...current.listingOverrides, [listingId]: next },
        };
      });
    },
    [update],
  );

  const markListingFilled = useCallback(
    (listingId: string) => {
      update((current) => {
        const created = current.createdListings.find((listing) => listing.id === listingId);
        const source = current.listingOverrides[listingId] ?? created ?? hostDemoListings.find((listing) => listing.id === listingId);
        if (!source || source.openPositions === 0) return current;
        const nextStatus = source.status === "published" ? "paused" : source.status;
        const next: HostDemoListing = {
          ...source,
          status: nextStatus,
          filledPositions: source.openPositions,
          lifecycle: [
            ...source.lifecycle,
            {
              id: `demo_listing_filled_${Date.now()}`,
              status: nextStatus,
              reason: `All ${source.openPositions} positions marked filled; a live listing is paused so it is no longer discoverable.`,
              changedLabel: "Changed in this demo",
            },
          ],
        };
        if (created) {
          return { ...current, createdListings: current.createdListings.map((listing) => listing.id === listingId ? next : listing) };
        }
        return { ...current, listingOverrides: { ...current.listingOverrides, [listingId]: next } };
      });
    },
    [update],
  );

  const updateListing = useCallback(
    (listing: HostDemoListing) => {
      update((current) => {
        const normalized = {
          ...listing,
          filledPositions: Math.min(listing.filledPositions, listing.openPositions),
        };
        if (current.createdListings.some((item) => item.id === listing.id)) {
          return {
            ...current,
            createdListings: current.createdListings.map((item) =>
              item.id === listing.id ? normalized : item,
            ),
          };
        }
        if (!hostDemoListings.some((item) => item.id === listing.id)) return current;
        return {
          ...current,
          listingOverrides: { ...current.listingOverrides, [listing.id]: normalized },
        };
      });
    },
    [update],
  );

  const duplicateListing = useCallback(
    (listingId: string): string | null => {
      const source = listingFor(listingId);
      if (!source) return null;
      const id = `demo_listing_duplicate_${Date.now()}`;
      update((current) => ({
        ...current,
        createdListings: [
          {
            ...source,
            id,
            title: `${source.title} copy`,
            status: "draft",
            applications: 0,
            filledPositions: 0,
            publishedAt: null,
            lifecycle: [],
            applicationDeadline: "No deadline",
            applicationDeadlineDetail: "No application deadline set",
          },
          ...current.createdListings,
        ],
      }));
      return id;
    },
    [listingFor, update],
  );

  const sendReply = useCallback(
    (threadId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      update((current) => {
        const previous = current.replies[threadId] ?? [];
        const message: HostDemoMessage = {
          id: `demo_reply_${Date.now()}`,
          sender: "host",
          body: trimmed,
          sentAt: "Just now",
        };
        return {
          ...current,
          replies: { ...current.replies, [threadId]: [...previous, message] },
          readThreadIds: current.readThreadIds.includes(threadId)
            ? current.readThreadIds
            : [...current.readThreadIds, threadId],
        };
      });
    },
    [update],
  );

  const createDraft = useCallback(
    (input: HostDemoCreateListingInput): string => {
      const id = `demo_listing_created_${Date.now()}`;
      const listing: HostDemoListing = {
        id,
        title: input.title.trim() || "Untitled seasonal role",
        category: "seasonal",
        location: input.location.trim() || hostDemoHost.location,
        summary: input.summary.trim() || "A new role ready to finish and preview.",
        description: input.description.trim() || "Add the full position description before publishing.",
        startDate: input.startDate || "Not set",
        endDate: input.endDate || "Not set",
        seasonLength: hostDemoSeasonLength(input.startDate, input.endDate),
        housing: input.housing.trim() || "Not stated",
        meals: input.meals.trim() || "Not stated",
        pay: input.pay.trim() || "Not stated",
        housingIncluded: input.housingProvision === "provided",
        mealsIncluded: input.mealsProvision === "provided" || input.mealsProvision === "partial",
        compensationMinCents: Math.max(0, input.payMinimumCents),
        compensationMaxCents: Math.max(input.payMinimumCents, input.payMaximumCents),
        compensationUnit: "hour",
        compensationCurrency: DEFAULT_CURRENCY,
        publishedAt: null,
        status: "draft",
        applications: 0,
        openPositions: Math.max(1, input.openPositions || 1),
        applicationDeadline: input.applicationDeadline || "No deadline",
        applicationDeadlineDetail: input.applicationDeadline
          ? "Deadline set in this demo draft"
          : "No application deadline set",
        responsibilities: input.responsibilities,
        requirements: input.requirements,
        training: input.training,
        highlights: input.highlights,
        applicationQuestions: input.applicationQuestions,
        housingDetails: {
          provision: input.housingProvision,
          type: input.housingType,
          cost: input.housingCost,
          occupancy: input.housingOccupancy,
          distanceFromWork: input.housingDistance,
          availability: input.housingAvailability,
          amenities: input.housingAmenities,
          utilities: input.housingUtilities,
          rules: input.housingRules,
        },
        mealsDetails: {
          provision: input.mealsProvision,
          cost: input.mealsCost,
          style: input.mealsStyle,
          included: input.mealsIncluded,
          dietaryAccommodations: input.dietaryAccommodations,
        },
        payDetails: {
          estimatedHoursPerWeek: input.estimatedHoursPerWeek,
          additionalCompensation: input.additionalCompensation,
        },
        media: [{
          id: `${id}_cover`,
          label: "Role cover",
          imageUrl: hostDemoHost.imageUrl,
          imageAlt: hostDemoHost.imageAlt,
          imageWidth: hostDemoHost.imageWidth,
          imageHeight: hostDemoHost.imageHeight,
        }],
        filledPositions: 0,
        lifecycle: [],
        imageUrl: hostDemoHost.imageUrl,
        imageAlt: hostDemoHost.imageAlt,
        imageWidth: hostDemoHost.imageWidth,
        imageHeight: hostDemoHost.imageHeight,
      };
      update((current) => ({
        ...current,
        createdListings: [listing, ...current.createdListings],
      }));
      return id;
    },
    [update],
  );

  const saveProfile = useCallback(
    (profile: DemoProfileDraft) => {
      update((current) => ({ ...current, profile }));
    },
    [update],
  );

  const addAnnouncement = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      update((current) => ({
        ...current,
        announcements: [
          {
            id: `demo_announcement_${Date.now()}`,
            body: trimmed,
            createdLabel: "Added in this demo",
          },
          ...current.announcements,
        ],
      }));
    },
    [update],
  );

  const isNotificationRead = useCallback(
    (notificationId: string): boolean =>
      hostDemoNotifications.find((notification) => notification.id === notificationId)
        ?.initiallyRead === true || state.readNotificationIds.includes(notificationId),
    [state.readNotificationIds],
  );

  const isThreadUnread = useCallback(
    (threadId: string): boolean =>
      hostDemoThreads.find((thread) => thread.id === threadId)?.unread === true &&
      !state.readThreadIds.includes(threadId),
    [state.readThreadIds],
  );

  const markThreadRead = useCallback(
    (threadId: string) => {
      if (!hostDemoThreads.some((thread) => thread.id === threadId && thread.unread)) return;
      update((current) => current.readThreadIds.includes(threadId)
        ? current
        : { ...current, readThreadIds: [...current.readThreadIds, threadId] });
    },
    [update],
  );

  const markNotificationRead = useCallback(
    (notificationId: string) => {
      if (!hostDemoNotifications.some((notification) => notification.id === notificationId)) {
        return;
      }
      update((current) =>
        current.readNotificationIds.includes(notificationId)
          ? current
          : {
              ...current,
              readNotificationIds: [...current.readNotificationIds, notificationId],
            },
      );
    },
    [update],
  );

  const markAllNotificationsRead = useCallback(() => {
    update((current) => ({
      ...current,
      readNotificationIds: [
        ...new Set([
          ...current.readNotificationIds,
          ...hostDemoNotifications.map((notification) => notification.id),
        ]),
      ],
    }));
  }, [update]);

  const saveNotificationSettings = useCallback(
    (notificationSettings: DemoNotificationSettings) => {
      update((current) => ({ ...current, notificationSettings }));
    },
    [update],
  );

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
    setResetVersion((current) => current + 1);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // The in-memory reset still completed.
      }
    }
  }, []);

  const changeCount =
    Object.keys(state.applicationStatuses).length +
    Object.keys(state.applicationStatusReasons).length +
    Object.keys(state.applicantWorkspaces).length +
    Object.values(state.replies).reduce((total, messages) => total + messages.length, 0) +
    state.createdListings.length +
    Object.keys(state.listingOverrides).length +
    (JSON.stringify(state.profile) === JSON.stringify(DEFAULT_STATE.profile) ? 0 : 1) +
    Math.max(0, state.announcements.length - DEFAULT_STATE.announcements.length) +
    state.readNotificationIds.filter(
      (id) => !hostDemoNotifications.find((notification) => notification.id === id)?.initiallyRead,
    ).length +
    state.readThreadIds.length +
    (JSON.stringify(state.notificationSettings) ===
    JSON.stringify(DEFAULT_STATE.notificationSettings)
      ? 0
      : 1);

  const unreadNotificationCount = hostDemoNotifications.filter(
    (notification) => !isNotificationRead(notification.id),
  ).length;
  const unreadMessageCount = hostDemoThreads.filter((thread) => isThreadUnread(thread.id)).length;
  const profileCompletion = hostDemoProfileCompletion(state.profile);

  const value = useMemo<HostDemoSessionValue>(
    () => ({
      ...state,
      ready,
      changeCount,
      resetVersion,
      listings,
      unreadNotificationCount,
      unreadMessageCount,
      profileCompletion,
      statusFor,
      transitionApplication,
      applicationStatusReasonFor,
      applicantWorkspaceFor,
      saveApplicantWorkspace,
      listingFor,
      transitionListing,
      markListingFilled,
      updateListing,
      duplicateListing,
      sendReply,
      createDraft,
      saveProfile,
      addAnnouncement,
      markNotificationRead,
      markAllNotificationsRead,
      isNotificationRead,
      isThreadUnread,
      markThreadRead,
      saveNotificationSettings,
      reset,
    }),
    [
      state,
      ready,
      changeCount,
      resetVersion,
      listings,
      unreadNotificationCount,
      unreadMessageCount,
      profileCompletion,
      statusFor,
      transitionApplication,
      applicationStatusReasonFor,
      applicantWorkspaceFor,
      saveApplicantWorkspace,
      listingFor,
      transitionListing,
      markListingFilled,
      updateListing,
      duplicateListing,
      sendReply,
      createDraft,
      saveProfile,
      addAnnouncement,
      markNotificationRead,
      markAllNotificationsRead,
      isNotificationRead,
      isThreadUnread,
      markThreadRead,
      saveNotificationSettings,
      reset,
    ],
  );

  return (
    <HostDemoSessionContext.Provider value={value}>
      {children}
    </HostDemoSessionContext.Provider>
  );
}

export function useHostDemoSession(): HostDemoSessionValue {
  const value = useContext(HostDemoSessionContext);
  if (!value) {
    throw new Error("useHostDemoSession must be used inside HostDemoSessionProvider");
  }
  return value;
}

/** Remounts route-local controls when the global demo reset is used. */
export function HostDemoResetBoundary({ children }: { readonly children: ReactNode }) {
  const { ready, resetVersion } = useHostDemoSession();
  if (!ready) return <p aria-busy="true">Loading sample workspace…</p>;
  return <Fragment key={resetVersion}>{children}</Fragment>;
}
