"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from "@explore-and-earn/db";

export interface NotificationPrefsActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Read the signed-in seeker's notification preferences. Falls back to all-ON
 * defaults when signed out so the settings form always has something to render.
 */
export async function getNotificationPrefsAction(): Promise<NotificationPrefs> {
  const { userId, getToken } = await auth();
  if (!userId) return DEFAULT_NOTIFICATION_PREFS;
  const token = await getToken({ template: "supabase" });
  if (!token) return DEFAULT_NOTIFICATION_PREFS;
  return getNotificationPrefs(token, userId);
}

/**
 * Persist the signed-in seeker's notification preferences, then revalidate the
 * settings surface so a fresh server render reflects the saved values.
 */
export async function saveNotificationPrefsAction(
  prefs: NotificationPrefs,
): Promise<NotificationPrefsActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };
  const token = await getToken({ template: "supabase" });
  if (!token) return { ok: false, error: "unauthenticated" };

  const result = await saveNotificationPrefs(token, userId, prefs);
  if (result.ok) {
    revalidatePath("/settings");
  }
  return result;
}
