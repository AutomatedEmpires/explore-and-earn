"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  saveSeekerProfile,
  updateNotificationPrefs,
  type NotificationPrefsPatch,
} from "@explore-and-earn/db";

export interface SettingsActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Trim and persist the seeker's display name.
 * Validates: 1-80 characters after trimming.
 */
export async function updateDisplayNameAction(
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

/**
 * Partially update the seeker's email notification preferences.
 * Only keys present in `prefs` are written; others are left unchanged.
 */
export async function updateNotificationPrefsAction(
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
