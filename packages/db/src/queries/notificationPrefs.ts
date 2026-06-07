import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Seeker email-notification preferences.
 *
 * Stored as boolean columns on `seeker_profiles` (migration 018). Hosts have no
 * preference row -- only seekers can tune these.
 *
 * SECURITY / TYPES: same model as sibling query modules. RLS not yet enabled.
 * // types not yet generated: email_on_invite, email_on_status_change, email_on_message
 */

export interface NotificationPrefs {
  readonly emailOnInvite: boolean;
  readonly emailOnStatusChange: boolean;
  readonly emailOnMessage: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  emailOnInvite: true,
  emailOnStatusChange: true,
  emailOnMessage: true,
};

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function rowToPrefs(row: Record<string, unknown> | null): NotificationPrefs {
  if (!row) return DEFAULT_NOTIFICATION_PREFS;
  return {
    emailOnInvite: asBool(row.email_on_invite, true),
    emailOnStatusChange: asBool(row.email_on_status_change, true),
    emailOnMessage: asBool(row.email_on_message, true),
  };
}

export async function getNotificationPrefs(
  clerkToken: string,
  clerkUserId: string,
): Promise<NotificationPrefs> {
  if (!clerkUserId) return DEFAULT_NOTIFICATION_PREFS;
  try {
    const db = untypedClient(clerkToken);
    const { data, error } = await db
      .from("seeker_profiles")
      .select("email_on_invite, email_on_status_change, email_on_message")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    if (error || !data) return DEFAULT_NOTIFICATION_PREFS;
    return rowToPrefs(data as Record<string, unknown>);
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export interface SaveNotificationPrefsResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function saveNotificationPrefs(
  clerkToken: string,
  clerkUserId: string,
  prefs: NotificationPrefs,
): Promise<SaveNotificationPrefsResult> {
  if (!clerkUserId) return { ok: false, error: "unauthenticated" };
  try {
    const db = untypedClient(clerkToken);
    const { error } = await db
      .from("seeker_profiles")
      .update({
        email_on_invite: prefs.emailOnInvite,
        email_on_status_change: prefs.emailOnStatusChange,
        email_on_message: prefs.emailOnMessage,
      })
      .eq("clerk_user_id", clerkUserId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/* -------------------------------------------------------------------------- */
/* Partial preference update (Wave 10 / Agent B).                             */
/* -------------------------------------------------------------------------- */

/** Subset of notification prefs to update; omitted keys are left unchanged. */
export interface NotificationPrefsPatch {
  readonly emailOnInvite?: boolean;
  readonly emailOnStatusChange?: boolean;
  readonly emailOnMessage?: boolean;
}

/**
 * Partially update the seeker's notification preferences. Only the keys
 * present in `prefs` are written; others are untouched.
 */
export async function updateNotificationPrefs(
  clerkToken: string,
  clerkUserId: string,
  prefs: NotificationPrefsPatch,
): Promise<SaveNotificationPrefsResult> {
  if (!clerkUserId) return { ok: false, error: "unauthenticated" };

  const patch: Record<string, boolean> = {};
  if (prefs.emailOnInvite !== undefined)
    patch.email_on_invite = prefs.emailOnInvite;
  if (prefs.emailOnStatusChange !== undefined)
    patch.email_on_status_change = prefs.emailOnStatusChange;
  if (prefs.emailOnMessage !== undefined)
    patch.email_on_message = prefs.emailOnMessage;

  if (Object.keys(patch).length === 0) return { ok: true };

  try {
    const db = untypedClient(clerkToken);
    const { error } = await db
      .from("seeker_profiles")
      .update(patch)
      .eq("clerk_user_id", clerkUserId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}
