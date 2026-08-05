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
  hostDemoHost,
  hostDemoListingActions,
  hostDemoListings,
  hostDemoNotifications,
  hostDemoProfileDetails,
  hostDemoPublicProfile,
  type DemoApplicationStatus,
  type HostDemoListing,
  type HostDemoMessage,
} from "./adapter";

const STORAGE_KEY = "ee_full_fidelity_host_demo_v2";

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

interface PersistedHostDemoState {
  readonly applicationStatuses: Readonly<Record<string, DemoApplicationStatus>>;
  readonly replies: Readonly<Record<string, readonly HostDemoMessage[]>>;
  readonly createdListings: readonly HostDemoListing[];
  readonly listingOverrides: Readonly<Record<string, HostDemoListing>>;
  readonly profile: DemoProfileDraft;
  readonly announcements: readonly DemoAnnouncement[];
  readonly readNotificationIds: readonly string[];
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
  readonly statusFor: (applicationId: string) => DemoApplicationStatus;
  readonly transitionApplication: (
    applicationId: string,
    status: DemoApplicationStatus,
  ) => void;
  readonly listingFor: (listingId: string) => HostDemoListing | undefined;
  readonly transitionListing: (
    listingId: string,
    status: HostDemoListing["status"],
  ) => void;
  readonly updateListing: (listing: HostDemoListing) => void;
  readonly duplicateListing: (listingId: string) => string | null;
  readonly sendReply: (threadId: string, body: string) => void;
  readonly createDraft: (input: {
    readonly title: string;
    readonly location: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly pay: string;
    readonly housing: string;
    readonly meals: string;
    readonly summary: string;
    readonly applicationDeadline: string;
    readonly openPositions: number;
  }) => string;
  readonly saveProfile: (profile: DemoProfileDraft) => void;
  readonly addAnnouncement: (body: string) => void;
  readonly markNotificationRead: (notificationId: string) => void;
  readonly markAllNotificationsRead: () => void;
  readonly isNotificationRead: (notificationId: string) => boolean;
  readonly saveNotificationSettings: (settings: DemoNotificationSettings) => void;
  readonly reset: () => void;
}

const HostDemoSessionContext = createContext<HostDemoSessionValue | null>(null);

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
      "new",
    [state.applicationStatuses],
  );

  const transitionApplication = useCallback(
    (applicationId: string, status: DemoApplicationStatus) => {
      update((current) => ({
        ...current,
        applicationStatuses: hostDemoApplicationActions(
          current.applicationStatuses[applicationId] ??
            hostDemoApplications.find((application) => application.id === applicationId)
              ?.status ??
            "new",
        ).some((action) => action.status === status)
          ? { ...current.applicationStatuses, [applicationId]: status }
          : current.applicationStatuses,
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
    (listingId: string, status: HostDemoListing["status"]) => {
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
        const next = { ...source, status };
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

  const updateListing = useCallback(
    (listing: HostDemoListing) => {
      update((current) => {
        if (current.createdListings.some((item) => item.id === listing.id)) {
          return {
            ...current,
            createdListings: current.createdListings.map((item) =>
              item.id === listing.id ? listing : item,
            ),
          };
        }
        if (!hostDemoListings.some((item) => item.id === listing.id)) return current;
        return {
          ...current,
          listingOverrides: { ...current.listingOverrides, [listing.id]: listing },
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
        };
      });
    },
    [update],
  );

  const createDraft = useCallback(
    (input: {
      readonly title: string;
      readonly location: string;
      readonly startDate: string;
      readonly endDate: string;
      readonly pay: string;
      readonly housing: string;
      readonly meals: string;
      readonly summary: string;
      readonly applicationDeadline: string;
      readonly openPositions: number;
    }): string => {
      const id = `demo_listing_created_${Date.now()}`;
      const listing: HostDemoListing = {
        id,
        title: input.title.trim() || "Untitled seasonal role",
        location: input.location.trim() || hostDemoHost.location,
        summary: input.summary.trim() || "A new role ready to finish and preview.",
        description: input.summary.trim() || "Add the full position description before publishing.",
        startDate: input.startDate || "Not set",
        endDate: input.endDate || "Not set",
        seasonLength: "Set by the dates above",
        housing: input.housing.trim() || "Not stated",
        meals: input.meals.trim() || "Not stated",
        pay: input.pay.trim() || "Not stated",
        status: "draft",
        applications: 0,
        openPositions: Math.max(1, input.openPositions || 1),
        applicationDeadline: input.applicationDeadline || "No deadline",
        applicationDeadlineDetail: input.applicationDeadline
          ? "Deadline set in this demo draft"
          : "No application deadline set",
        requirements: ["Add requirements before publishing"],
        highlights: ["Draft — only visible in this demo"],
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
    Object.values(state.replies).reduce((total, messages) => total + messages.length, 0) +
    state.createdListings.length +
    Object.keys(state.listingOverrides).length +
    (JSON.stringify(state.profile) === JSON.stringify(DEFAULT_STATE.profile) ? 0 : 1) +
    Math.max(0, state.announcements.length - DEFAULT_STATE.announcements.length) +
    state.readNotificationIds.filter(
      (id) => !hostDemoNotifications.find((notification) => notification.id === id)?.initiallyRead,
    ).length +
    (JSON.stringify(state.notificationSettings) ===
    JSON.stringify(DEFAULT_STATE.notificationSettings)
      ? 0
      : 1);

  const unreadNotificationCount = hostDemoNotifications.filter(
    (notification) => !isNotificationRead(notification.id),
  ).length;

  const value = useMemo<HostDemoSessionValue>(
    () => ({
      ...state,
      ready,
      changeCount,
      resetVersion,
      listings,
      unreadNotificationCount,
      statusFor,
      transitionApplication,
      listingFor,
      transitionListing,
      updateListing,
      duplicateListing,
      sendReply,
      createDraft,
      saveProfile,
      addAnnouncement,
      markNotificationRead,
      markAllNotificationsRead,
      isNotificationRead,
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
      statusFor,
      transitionApplication,
      listingFor,
      transitionListing,
      updateListing,
      duplicateListing,
      sendReply,
      createDraft,
      saveProfile,
      addAnnouncement,
      markNotificationRead,
      markAllNotificationsRead,
      isNotificationRead,
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
