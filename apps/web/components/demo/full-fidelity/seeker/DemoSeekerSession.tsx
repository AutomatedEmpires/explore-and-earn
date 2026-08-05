"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  seekerDemoApplications,
  seekerDemoInitialSavedIds,
  seekerDemoListings,
  seekerDemoNotifications,
  seekerDemoNow,
  seekerDemoPerson,
  seekerDemoThreads,
  type SeekerDemoWorkHistory,
  type SeekerDemoMessage,
} from "./model";

const STORAGE_KEY = "explore-and-earn:full-fidelity-seeker:v2";

interface StoredDemoState {
  readonly savedIds: readonly string[];
  readonly skippedIds: readonly string[];
  readonly appliedIds: readonly string[];
  readonly localApplications: readonly DemoLocalApplication[];
  readonly readNotificationIds: readonly string[];
  readonly readThreadIds: readonly string[];
  readonly sentMessages: Readonly<Record<string, readonly SeekerDemoMessage[]>>;
  readonly profile: DemoProfileState;
}

export interface DemoProfileState {
  readonly intro: string;
  readonly openTo: string;
  readonly availability: string;
  readonly preferences: readonly string[];
  readonly housingNeeded: boolean;
  readonly transportation: string;
  readonly skills: readonly string[];
  readonly certifications: readonly string[];
  readonly workHistory: readonly SeekerDemoWorkHistory[];
  readonly portfolioUrl: string;
}

export interface DemoLocalApplication {
  readonly listingId: string;
  readonly submittedAt: string;
}

interface DemoSeekerSessionValue extends StoredDemoState {
  readonly ready: boolean;
  readonly save: (listingId: string) => void;
  readonly skip: (listingId: string) => void;
  readonly apply: (listingId: string) => void;
  readonly markNotificationRead: (notificationId: string) => void;
  readonly markAllNotificationsRead: () => void;
  readonly isThreadUnread: (threadId: string) => boolean;
  readonly markThreadRead: (threadId: string) => void;
  readonly unreadMessageCount: number;
  readonly sendMessage: (threadId: string, body: string) => void;
  readonly updateProfile: (profile: DemoProfileState) => void;
  readonly persistenceAvailable: boolean;
  readonly resetVersion: number;
  readonly reset: () => void;
}

function initialState(): StoredDemoState {
  const appliedIds = seekerDemoApplications.map((application) => application.listingId);
  const savedCandidate = seekerDemoListings.find((listing) => !appliedIds.includes(listing.id));
  return {
    savedIds: seekerDemoInitialSavedIds.length > 0
      ? seekerDemoInitialSavedIds
      : savedCandidate ? [savedCandidate.id] : [],
    skippedIds: [],
    appliedIds,
    localApplications: [],
    readNotificationIds: seekerDemoNotifications.filter((notification) => notification.read).map((notification) => notification.id),
    readThreadIds: [],
    sentMessages: {},
    profile: {
      intro: seekerDemoPerson.intro,
      openTo: seekerDemoPerson.openTo,
      availability: seekerDemoPerson.availability,
      preferences: seekerDemoPerson.preferences,
      housingNeeded: seekerDemoPerson.housingNeeded,
      transportation: seekerDemoPerson.transportation,
      skills: seekerDemoPerson.skills,
      certifications: seekerDemoPerson.certifications,
      workHistory: seekerDemoPerson.workHistory,
      portfolioUrl: "",
    },
  };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isWorkHistoryArray(value: unknown): value is readonly SeekerDemoWorkHistory[] {
  return Array.isArray(value) && value.every((entry) => (
    entry !== null
    && typeof entry === "object"
    && typeof (entry as SeekerDemoWorkHistory).id === "string"
    && typeof (entry as SeekerDemoWorkHistory).organization === "string"
    && typeof (entry as SeekerDemoWorkHistory).role === "string"
    && isStringArray((entry as SeekerDemoWorkHistory).highlights)
  ));
}

function isLocalApplicationArray(value: unknown): value is readonly DemoLocalApplication[] {
  return Array.isArray(value) && value.every((entry) => (
    entry !== null
    && typeof entry === "object"
    && typeof (entry as DemoLocalApplication).listingId === "string"
    && typeof (entry as DemoLocalApplication).submittedAt === "string"
  ));
}

function restoreState(value: string | null): StoredDemoState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredDemoState>;
    if (
      !isStringArray(parsed.savedIds) ||
      !isStringArray(parsed.skippedIds) ||
      !isStringArray(parsed.appliedIds) ||
      !isLocalApplicationArray(parsed.localApplications) ||
      !isStringArray(parsed.readNotificationIds) ||
      (parsed.readThreadIds !== undefined && !isStringArray(parsed.readThreadIds)) ||
      !parsed.sentMessages ||
      typeof parsed.sentMessages !== "object" ||
      !parsed.profile ||
      typeof parsed.profile.intro !== "string" ||
      typeof parsed.profile.openTo !== "string" ||
      typeof parsed.profile.availability !== "string" ||
      !isStringArray(parsed.profile.preferences) ||
      typeof parsed.profile.housingNeeded !== "boolean" ||
      typeof parsed.profile.transportation !== "string" ||
      !isStringArray(parsed.profile.skills) ||
      !isStringArray(parsed.profile.certifications) ||
      !isWorkHistoryArray(parsed.profile.workHistory) ||
      typeof parsed.profile.portfolioUrl !== "string"
    ) {
      return null;
    }
    return {
      savedIds: parsed.savedIds,
      skippedIds: parsed.skippedIds,
      appliedIds: parsed.appliedIds,
      localApplications: parsed.localApplications,
      readNotificationIds: parsed.readNotificationIds,
      readThreadIds: parsed.readThreadIds ?? [],
      sentMessages: parsed.sentMessages,
      profile: parsed.profile,
    };
  } catch {
    return null;
  }
}

const DemoSeekerSessionContext = createContext<DemoSeekerSessionValue | null>(null);

export function profileReadiness(profile: DemoProfileState): number {
  let score = 0;
  if (profile.intro.trim()) score += 15;
  if (profile.workHistory.length > 0) score += 25;
  if (profile.skills.length > 0 && profile.certifications.length > 0) score += 15;
  if (profile.availability.trim()) score += 15;
  if (profile.preferences.length > 0) score += 15;
  if (profile.transportation.trim()) score += 10;
  if (profile.portfolioUrl.trim()) score += 5;
  return score;
}

function readStoredState(): { readonly value: string | null; readonly available: boolean } {
  try {
    return { value: window.sessionStorage.getItem(STORAGE_KEY), available: true };
  } catch {
    return { value: null, available: false };
  }
}

function writeStoredState(state: StoredDemoState): boolean {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function removeStoredState(): boolean {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function DemoSeekerSessionProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<StoredDemoState>(initialState);
  const [restored, setRestored] = useState(false);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const [resetVersion, setResetVersion] = useState(0);

  useEffect(() => {
    const stored = readStoredState();
    setPersistenceAvailable(stored.available);
    setState(restoreState(stored.value) ?? initialState());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (!writeStoredState(state)) setPersistenceAvailable(false);
  }, [restored, state]);

  const save = useCallback((listingId: string) => {
    setState((current) => ({
      ...current,
      savedIds: current.savedIds.includes(listingId)
        ? current.savedIds.filter((id) => id !== listingId)
        : [...current.savedIds, listingId],
      skippedIds: current.skippedIds.filter((id) => id !== listingId),
    }));
  }, []);

  const skip = useCallback((listingId: string) => {
    setState((current) => ({
      ...current,
      skippedIds: current.skippedIds.includes(listingId)
        ? current.skippedIds
        : [...current.skippedIds, listingId],
      savedIds: current.savedIds.filter((id) => id !== listingId),
    }));
  }, []);

  const apply = useCallback((listingId: string) => {
    setState((current) => {
      if (current.appliedIds.includes(listingId)) return current;
      const submittedAt = new Date(
        seekerDemoNow.getTime() + (current.localApplications.length + 1) * 60_000,
      ).toISOString();
      return {
        ...current,
        appliedIds: [...current.appliedIds, listingId],
        localApplications: [...current.localApplications, { listingId, submittedAt }],
        skippedIds: current.skippedIds.filter((id) => id !== listingId),
        savedIds: current.savedIds.filter((id) => id !== listingId),
      };
    });
  }, []);

  const markNotificationRead = useCallback((notificationId: string) => {
    setState((current) => ({
      ...current,
      readNotificationIds: current.readNotificationIds.includes(notificationId)
        ? current.readNotificationIds
        : [...current.readNotificationIds, notificationId],
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setState((current) => ({
      ...current,
      readNotificationIds: seekerDemoNotifications.map((notification) => notification.id),
    }));
  }, []);

  const sendMessage = useCallback((threadId: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setState((current) => {
      const prior = current.sentMessages[threadId] ?? [];
      const sentAt = new Date(seekerDemoNow.getTime() + (prior.length + 1) * 60_000).toISOString();
      const nextMessage: SeekerDemoMessage = {
        id: `demo_sent_${threadId}_${prior.length + 1}`,
        sender: "seeker",
        senderName: "You",
        body: trimmed,
        sentAt,
      };
      return {
        ...current,
        readThreadIds: current.readThreadIds.includes(threadId)
          ? current.readThreadIds
          : [...current.readThreadIds, threadId],
        sentMessages: {
          ...current.sentMessages,
          [threadId]: [...prior, nextMessage],
        },
      };
    });
  }, []);

  const isThreadUnread = useCallback((threadId: string): boolean => (
    seekerDemoThreads.find((thread) => thread.id === threadId)?.unread === true
    && !state.readThreadIds.includes(threadId)
  ), [state.readThreadIds]);

  const markThreadRead = useCallback((threadId: string) => {
    if (!seekerDemoThreads.some((thread) => thread.id === threadId && thread.unread)) return;
    setState((current) => current.readThreadIds.includes(threadId)
      ? current
      : { ...current, readThreadIds: [...current.readThreadIds, threadId] });
  }, []);

  const unreadMessageCount = seekerDemoThreads.filter((thread) => isThreadUnread(thread.id)).length;

  const reset = useCallback(() => {
    if (!removeStoredState()) setPersistenceAvailable(false);
    setState(initialState());
    setResetVersion((current) => current + 1);
  }, []);

  const updateProfile = useCallback((profile: DemoProfileState) => {
    setState((current) => ({ ...current, profile }));
  }, []);

  const value = useMemo<DemoSeekerSessionValue>(() => ({
    ...state,
    save,
    skip,
    apply,
    markNotificationRead,
    markAllNotificationsRead,
    isThreadUnread,
    markThreadRead,
    unreadMessageCount,
    ready: restored,
    sendMessage,
    updateProfile,
    persistenceAvailable,
    resetVersion,
    reset,
  }), [state, save, skip, apply, markNotificationRead, markAllNotificationsRead, isThreadUnread, markThreadRead, unreadMessageCount, sendMessage, updateProfile, persistenceAvailable, restored, resetVersion, reset]);

  return (
    <DemoSeekerSessionContext.Provider value={value}>
      {children}
    </DemoSeekerSessionContext.Provider>
  );
}

export function useDemoSeekerSession(): DemoSeekerSessionValue {
  const value = useContext(DemoSeekerSessionContext);
  if (!value) throw new Error("useDemoSeekerSession must be used within DemoSeekerSessionProvider");
  return value;
}
