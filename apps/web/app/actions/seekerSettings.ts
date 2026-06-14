"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authedClient,
  saveSeekerProfile,
  updateNotificationPrefs,
  type NotificationPrefsPatch,
} from "@explore-and-earn/db";

import { reportError } from "../../lib/sentry";

export interface SettingsActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

// Values must match DB CHECK constraint: available_now | date_range | flexible | unavailable
const SCHEDULE_STATUSES = ["available_now", "date_range", "flexible", "unavailable"] as const;
// Values must match DB CHECK constraint: local_only | willing_to_travel | ready_to_relocate | remote_only | flexible
const TRAVEL_READINESS = [
  "local_only",
  "willing_to_travel",
  "ready_to_relocate",
  "remote_only",
  "flexible",
] as const;

async function currentUserId(): Promise<string | undefined> {
  try {
    return (await auth()).userId ?? undefined;
  } catch {
    return undefined;
  }
}

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function updateSeekerProfileColumns(
  clerkToken: string,
  clerkUserId: string,
  patch: Record<string, unknown>,
): Promise<SettingsActionResult> {
  if (Object.keys(patch).length === 0) return { ok: true };

  try {
    const db = untypedClient(clerkToken);
    const { data: existing, error: lookupError } = await db
      .from("seeker_profiles")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();

    if (lookupError) return { ok: false, error: lookupError.message };

    const existingId =
      existing && (existing as Record<string, unknown>).id
        ? String((existing as Record<string, unknown>).id)
        : null;

    if (existingId) {
      const { error } = await db
        .from("seeker_profiles")
        .update(patch)
        .eq("id", existingId);
      return error ? { ok: false, error: error.message } : { ok: true };
    }

    const { error } = await db
      .from("seeker_profiles")
      .insert({ clerk_user_id: clerkUserId, ...patch });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "unknown_error",
    };
  }
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
  const token = await getToken({ template: "supabase" });
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
async function updateScheduleActionImpl(
  formData: FormData,
): Promise<SettingsActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };
  const token = await getToken({ template: "supabase" });
  if (!token) return { ok: false, error: "unauthenticated" };

  const status = formValue(formData, "availability_status");
  if (!(SCHEDULE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "invalid_status" };
  }

  const result = await updateSeekerProfileColumns(token, userId, {
    availability_start: dateInputToIso(formValue(formData, "availability_start")),
    availability_end: dateInputToIso(formValue(formData, "availability_end")),
    availability_status: status,
  });

  if (result.ok) {
    revalidatePath("/schedule");
    revalidatePath("/home");
  }
  return result;
}

export async function updateScheduleAction(formData: FormData): Promise<void> {
  try {
    await updateScheduleActionImpl(formData);
  } catch (error) {
    reportError(error, {
      action: "updateScheduleAction",
      userId: await currentUserId(),
    });
    throw error;
  }
}

/**
 * Persist the seeker's travel readiness and preferred location text.
 */
async function updateTravelActionImpl(
  formData: FormData,
): Promise<SettingsActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };
  const token = await getToken({ template: "supabase" });
  if (!token) return { ok: false, error: "unauthenticated" };

  const readiness = formValue(formData, "travel_readiness");
  if (!(TRAVEL_READINESS as readonly string[]).includes(readiness)) {
    return { ok: false, error: "invalid_travel_readiness" };
  }

  const locationPref = formValue(formData, "location_pref");
  const result = await updateSeekerProfileColumns(token, userId, {
    travel_readiness: readiness,
    location_pref: locationPref.length > 0 ? locationPref : null,
  });

  if (result.ok) {
    revalidatePath("/travel");
    revalidatePath("/home");
  }
  return result;
}

export async function updateTravelAction(formData: FormData): Promise<void> {
  try {
    await updateTravelActionImpl(formData);
  } catch (error) {
    reportError(error, {
      action: "updateTravelAction",
      userId: await currentUserId(),
    });
    throw error;
  }
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
  const token = await getToken({ template: "supabase" });
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
