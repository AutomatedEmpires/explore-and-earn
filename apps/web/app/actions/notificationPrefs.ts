"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  saveNotificationPrefs,
  updateNotificationPrefs as updateNotificationPrefsQuery,
  type NotificationPrefs,
  type NotificationPrefsPatch,
} from "@explore-and-earn/db";

import { reportError } from "../../lib/sentry";

export interface NotificationPrefsActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

async function currentUserId(): Promise<string | undefined> {
  try {
    return (await auth()).userId ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the signed-in seeker's notification preferences. Falls back to all-ON
 * defaults when signed out so the settings form always has something to render.
 */
async function getNotificationPrefsActionImpl(): Promise<NotificationPrefs> {
  const { userId, getToken } = await auth();
  if (!userId) return DEFAULT_NOTIFICATION_PREFS;
  const token = await getToken({ template: "supabase" });
  if (!token) return DEFAULT_NOTIFICATION_PREFS;
  return getNotificationPrefs(token, userId);
}

export async function getNotificationPrefsAction(): Promise<NotificationPrefs> {
  try {
    return await getNotificationPrefsActionImpl();
  } catch (error) {
    reportError(error, {
      action: "getNotificationPrefsAction",
      userId: await currentUserId(),
    });
    throw error;
  }
}

/**
 * Persist the signed-in seeker's notification preferences, then revalidate the
 * settings surface so a fresh server render reflects the saved values.
 */
async function saveNotificationPrefsActionImpl(
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

export async function saveNotificationPrefsAction(
  prefs: NotificationPrefs,
): Promise<NotificationPrefsActionResult> {
  try {
    return await saveNotificationPrefsActionImpl(prefs);
  } catch (error) {
    reportError(error, {
      action: "saveNotificationPrefsAction",
      userId: await currentUserId(),
    });
    throw error;
  }
}

/** Persist a partial notification-preference update for the signed-in seeker. */
async function updateNotificationPrefsActionImpl(
  prefs: NotificationPrefsPatch,
): Promise<NotificationPrefsActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };
  const token = await getToken({ template: "supabase" });
  if (!token) return { ok: false, error: "unauthenticated" };

  const result = await updateNotificationPrefsQuery(token, userId, prefs);
  if (result.ok) {
    revalidatePath("/settings");
  }
  return result;
}

export async function updateNotificationPrefsAction(
  prefs: NotificationPrefsPatch,
): Promise<NotificationPrefsActionResult> {
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
