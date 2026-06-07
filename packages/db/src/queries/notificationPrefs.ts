import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Seeker email-notification preferences.
 *
 * Stored as boolean columns on `seeker_profiles` (migration 018). Hosts have no
 * preference row — only seekers can tune these — so callers gate host-recipient
 * emails separately.
 *
 * SECURITY / TYPES: same model as the sibling query modules. RLS is not yet
 * enabled, so reads/writes go through an UNTYPED authed client (the
 * clerk_user_id column and the 018 preference columns are not in the committed
 * types.gen.ts) and the caller passes an already-verified Clerk token plus the
 * Clerk user id from auth().userId — never decoded from the token.
 * // types not yet generated: seeker_profiles.clerk_user_id, email_on_invite, email_on_status_change, email_on_message
 */

export interface NotificationPrefs {
  readonly emailOnInvite: boolean;
  readonly emailOnStatusChange: boolean;
  readonly emailOnMessage: boolean;
}

/** Safe defaults: every email is ON unless the seeker turns it off. */
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

/**
 * Read the seeker's notification preferences by Clerk user id. Best-effort:
 * returns all-ON defaults when the profile/columns can't be resolved, so a
 * lookup failure never silently suppresses a notification.
 */
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

/**
 * Persist the seeker's notification preferences by Clerk user id. Scoped to the
 * seeker's own row (clerk_user_id from auth().userId).
 */
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
