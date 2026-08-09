"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  saveSeekerProfile,
  updateNotificationPrefs,
  type NotificationPrefsPatch,
  type SeekerProfileUpdate,
} from "@explore-and-earn/db";
import {
  SEEKER_AVAILABILITY_STATUS,
  SEEKER_TRAVEL_READINESS,
} from "@explore-and-earn/contracts";

import { queueSeekerMatchRecompute } from "../../lib/matchRecompute";
import { reportError } from "../../lib/sentry";

export interface SettingsActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/** Stable, serializable result consumed by the schedule and travel forms. */
export type SeekerSettingsSaveResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error:
        | "validation"
        | "unauthenticated"
        | "temporarily_unavailable";
    };

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const VALIDATION_FAILURE = { ok: false, error: "validation" } as const;
const UNAUTHENTICATED_FAILURE = {
  ok: false,
  error: "unauthenticated",
} as const;
const TEMPORARILY_UNAVAILABLE_FAILURE = {
  ok: false,
  error: "temporarily_unavailable",
} as const;

type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false };

interface SettingsSession {
  readonly userId: string;
  readonly token: string;
}

async function currentUserId(): Promise<string | undefined> {
  try {
    return (await auth()).userId ?? undefined;
  } catch {
    return undefined;
  }
}

function reportSettingsError(
  error: unknown,
  context: Parameters<typeof reportError>[1],
): void {
  try {
    reportError(error, context);
  } catch {
    // Error reporting is best-effort and must never change an action result.
  }
}

function readSingleFormString(formData: FormData, key: string): Parsed<string> {
  try {
    const values = formData.getAll(key);
    if (values.length === 0) return { ok: true, value: "" };
    if (values.length !== 1 || typeof values[0] !== "string") {
      return { ok: false };
    }
    return { ok: true, value: values[0].trim() };
  } catch {
    return { ok: false };
  }
}

function parseDateInput(value: string): Parsed<string | null> {
  if (value.length === 0) return { ok: true, value: null };

  const parts = DATE_INPUT_PATTERN.exec(value);
  if (!parts || parts[1] === "0000") return { ok: false };

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { ok: false };

  const iso = date.toISOString();
  return iso.slice(0, 10) === value
    ? { ok: true, value: iso }
    : { ok: false };
}

function parseNullableEnum<T extends string>(
  value: string,
  allowed: readonly T[],
): Parsed<T | null> {
  if (value.length === 0) return { ok: true, value: null };
  return (allowed as readonly string[]).includes(value)
    ? { ok: true, value: value as T }
    : { ok: false };
}

function parseScheduleForm(formData: FormData): Parsed<SeekerProfileUpdate> {
  const startRaw = readSingleFormString(formData, "availability_start");
  const endRaw = readSingleFormString(formData, "availability_end");
  const statusRaw = readSingleFormString(formData, "availability_status");
  if (!startRaw.ok || !endRaw.ok || !statusRaw.ok) return { ok: false };

  const start = parseDateInput(startRaw.value);
  const end = parseDateInput(endRaw.value);
  const status = parseNullableEnum(
    statusRaw.value,
    SEEKER_AVAILABILITY_STATUS,
  );
  if (!start.ok || !end.ok || !status.ok) return { ok: false };
  if (start.value !== null && end.value !== null && start.value > end.value) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      availabilityStart: start.value,
      availabilityEnd: end.value,
      availabilityStatus: status.value,
    },
  };
}

function parseTravelForm(formData: FormData): Parsed<SeekerProfileUpdate> {
  const readinessRaw = readSingleFormString(formData, "travel_readiness");
  const locationRaw = readSingleFormString(formData, "location_pref");
  if (!readinessRaw.ok || !locationRaw.ok) return { ok: false };

  const readiness = parseNullableEnum(
    readinessRaw.value,
    SEEKER_TRAVEL_READINESS,
  );
  if (!readiness.ok) return { ok: false };

  return {
    ok: true,
    value: {
      travelReadiness: readiness.value,
      locationPref: locationRaw.value.length > 0 ? locationRaw.value : null,
    },
  };
}

async function settingsSession(
  actionName: string,
): Promise<
  | { readonly ok: true; readonly session: SettingsSession }
  | { readonly ok: false; readonly result: SeekerSettingsSaveResult }
> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) return { ok: false, result: UNAUTHENTICATED_FAILURE };
    const token = await getToken();
    if (!token) return { ok: false, result: UNAUTHENTICATED_FAILURE };
    return { ok: true, session: { userId, token } };
  } catch (error) {
    reportSettingsError(error, { action: `${actionName}.authenticate` });
    return { ok: false, result: TEMPORARILY_UNAVAILABLE_FAILURE };
  }
}

async function persistSeekerSettings(
  actionName: string,
  update: SeekerProfileUpdate,
  revalidatePaths: readonly string[],
): Promise<SeekerSettingsSaveResult> {
  const authenticated = await settingsSession(actionName);
  if (!authenticated.ok) return authenticated.result;

  const { token, userId } = authenticated.session;
  try {
    const result = await saveSeekerProfile(token, userId, update);
    if (!result.ok) {
      reportSettingsError(
        new Error(result.error || "Seeker settings persistence was not confirmed"),
        { action: `${actionName}.persist`, userId },
      );
      return TEMPORARILY_UNAVAILABLE_FAILURE;
    }
  } catch (error) {
    reportSettingsError(error, {
      action: `${actionName}.persist`,
      userId,
    });
    return TEMPORARILY_UNAVAILABLE_FAILURE;
  }

  for (const path of revalidatePaths) {
    try {
      revalidatePath(path);
    } catch (error) {
      reportSettingsError(error, {
        action: `${actionName}.postPersistRevalidate`,
        route: path,
        userId,
      });
    }
  }

  try {
    queueSeekerMatchRecompute(userId);
  } catch (error) {
    reportSettingsError(error, {
      action: `${actionName}.postPersistRecompute`,
      userId,
    });
  }

  return { ok: true };
}

/**
 * Trim and persist the seeker's display name.
 * Validates: 1-80 characters after trimming.
 */
async function updateDisplayNameActionImpl(
  displayName: string,
): Promise<SettingsActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };
  const token = await getToken();
  if (!token) return { ok: false, error: "unauthenticated" };

  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return { ok: false, error: "invalid_length" };
  }

  const result = await saveSeekerProfile(token, userId, { displayName: trimmed });
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function updateDisplayNameAction(
  displayName: string,
): Promise<SettingsActionResult> {
  try {
    return await updateDisplayNameActionImpl(displayName);
  } catch (error) {
    reportError(error, {
      action: "updateDisplayNameAction",
      userId: await currentUserId(),
    });
    throw error;
  }
}

/**
 * Persist the seeker's availability window and availability status.
 */
export async function updateScheduleAction(
  formData: FormData,
): Promise<SeekerSettingsSaveResult> {
  const parsed = parseScheduleForm(formData);
  if (!parsed.ok) return VALIDATION_FAILURE;

  return persistSeekerSettings("updateScheduleAction", parsed.value, [
    "/schedule",
    "/home",
  ]);
}

/**
 * Persist the seeker's travel readiness and preferred location text.
 */
export async function updateTravelAction(
  formData: FormData,
): Promise<SeekerSettingsSaveResult> {
  const parsed = parseTravelForm(formData);
  if (!parsed.ok) return VALIDATION_FAILURE;

  return persistSeekerSettings("updateTravelAction", parsed.value, [
    "/travel",
    "/home",
  ]);
}

/**
 * Partially update the seeker's email notification preferences.
 * Only keys present in `prefs` are written; others are left unchanged.
 */
async function updateNotificationPrefsActionImpl(
  prefs: NotificationPrefsPatch,
): Promise<SettingsActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };
  const token = await getToken();
  if (!token) return { ok: false, error: "unauthenticated" };

  const result = await updateNotificationPrefs(token, userId, prefs);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function updateNotificationPrefsAction(
  prefs: NotificationPrefsPatch,
): Promise<SettingsActionResult> {
  try {
    return await updateNotificationPrefsActionImpl(prefs);
  } catch (error) {
    reportError(error, {
      action: "updateNotificationPrefsAction",
      userId: await currentUserId(),
    });
    throw error;
  }
}
