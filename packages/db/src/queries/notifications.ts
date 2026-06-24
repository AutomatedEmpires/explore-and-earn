import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";
import { adminClient } from "../adminClient";

/**
 * Notifications data access for the seeker notification feed + unread badge,
 * plus the host-facing "new application" side-effect insert.
 *
 * IDENTITY MODEL (read this before touching the queries):
 *   Auth is owned by Clerk (issue #105): the JWT `sub` claim minted by the
 *   "supabase" Clerk template is the CLERK id (`user_2abc...`), and every other
 *   query module scopes by that Clerk id. `notifications.recipient_user_id` was
 *   originally `NOT NULL references auth.users(id)` (migration 008) — the
 *   Supabase-side UUID. Clerk users have NO `auth.users` row, so that column
 *   never matched and feeds were always empty.
 *
 *   Migration 014 fixes delivery: it adds `notifications.recipient_clerk_user_id
 *   TEXT` (+ partial indexes) and drops the NOT NULL on `recipient_user_id`, so
 *   notifications are now addressed by Clerk id. All reads/writes below scope by
 *   `recipient_clerk_user_id`; `recipient_user_id` is retained only for
 *   back-compat with any legacy auth.users-linked rows.
 *
 * SECURITY: RLS is not yet enabled; `authedClient()` talks to PostgREST with
 * the anon key + the caller's Clerk JWT. Every query is therefore scoped in
 * application code by the verified `recipient_clerk_user_id`. Keep these manual
 * filters even once RLS lands; they are defense in depth.
 *
 * TYPES: `notifications.recipient_clerk_user_id` (migration 014) and the
 * Clerk-sync columns (migration 012: `host_profiles.clerk_user_id`) are not
 * reflected in the generated `packages/db/src/types.gen.ts`. A typed client
 * would reject `.eq("recipient_clerk_user_id", ...)` /
 * `.select("clerk_user_id")`, so we keep an untyped `SupabaseClient` handle for
 * `.from(...)` calls and narrow rows locally, mirroring the other query modules.
 * // types not yet generated: notifications.recipient_clerk_user_id, host_profiles.clerk_user_id
 */

export type NotificationCategory =
  | "applications"
  | "offers"
  | "invites"
  | "billing"
  | "safety"
  | "community"
  | "scheduling"
  | "verification"
  | "refunds"
  | "system";

export type NotificationPriority = "critical" | "important" | "informational";

export type NotificationChannel = "in_app" | "email";

/** A single notification row shaped for the seeker feed. */
export interface Notification {
  readonly id: string;
  readonly category: string;
  readonly priority: string;
  readonly channel: string;
  readonly title: string;
  readonly body: string | null;
  readonly eventId: string | null;
  readonly subjectType: string | null;
  readonly subjectId: string | null;
  readonly actionUrl: string | null;
  /** ISO-8601 timestamp, or null when unread. */
  readonly readAt: string | null;
  readonly dismissedAt: string | null;
  readonly createdAt: string;
}

const NOTIFICATION_COLUMNS =
  "id, category, priority, channel, title, body, event_id, subject_type, subject_id, action_url, read_at, dismissed_at, created_at";

/** Untyped Supabase handle (see TYPES note above). */
function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

function rowToNotification(raw: unknown): Notification {
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const nullableStr = (v: unknown): string | null =>
    typeof v === "string" ? v : null;
  return {
    id: str(r.id),
    category: str(r.category),
    priority: str(r.priority),
    channel: str(r.channel),
    title: str(r.title),
    body: nullableStr(r.body),
    eventId: nullableStr(r.event_id),
    subjectType: nullableStr(r.subject_type),
    subjectId: nullableStr(r.subject_id),
    actionUrl: nullableStr(r.action_url),
    readAt: nullableStr(r.read_at),
    dismissedAt: nullableStr(r.dismissed_at),
    createdAt: str(r.created_at),
  };
}

/**
 * Recent notifications for the authed seeker, newest first (limit 50).
 * Dismissed notifications are excluded. Returns an empty array when signed out.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken({ template: "supabase" })`.
 * @param clerkUserId - Verified Clerk user id from `auth().userId` — never decoded from the token.
 */
export async function getNotifications(
  clerkToken: string,
  clerkUserId: string,
): Promise<Notification[]> {
  if (!clerkUserId) {
    return [];
  }
  const db = untypedClient(clerkToken);

  const { data, error } = await db
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("recipient_clerk_user_id", clerkUserId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`getNotifications: ${error.message}`);
  }

  return (data ?? []).map(rowToNotification);
}

/**
 * Mark a single notification read (`read_at = now()`) for the authed seeker.
 * The `recipient_clerk_user_id` filter is an app-level ownership guard: a seeker
 * can only mark their own notifications, and the `read_at IS NULL` filter keeps
 * the write idempotent. Best-effort: returns `{ ok: false }` (never throws) when
 * the user is signed out or the write fails.
 */
export async function markNotificationRead(
  clerkToken: string,
  clerkUserId: string,
  notificationId: string,
): Promise<{ ok: boolean }> {
  try {
    if (!clerkUserId) {
      return { ok: false };
    }
    const db = untypedClient(clerkToken);

    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_clerk_user_id", clerkUserId)
      .is("read_at", null);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * Mark every unread notification for the authed seeker as read
 * (`read_at = now()`), scoped by `recipient_clerk_user_id`. Called when the
 * seeker opens the notifications page so the header unread badge clears.
 * Best-effort: returns `{ ok: false }` (never throws) on any failure.
 */
export async function markAllNotificationsRead(
  clerkToken: string,
  clerkUserId: string,
): Promise<{ ok: boolean }> {
  try {
    if (!clerkUserId) {
      return { ok: false };
    }
    const db = untypedClient(clerkToken);

    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_clerk_user_id", clerkUserId)
      .is("read_at", null);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * Count of the authed seeker's unread, non-dismissed notifications (for the
 * header badge). Resilient by design: returns 0 on any failure so a transient
 * error never breaks the seeker shell header.
 */
export async function getUnreadNotificationCount(
  clerkToken: string,
  clerkUserId: string,
): Promise<number> {
  try {
    if (!clerkUserId) {
      return 0;
    }
    const db = untypedClient(clerkToken);

    const { count, error } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_clerk_user_id", clerkUserId)
      .is("read_at", null)
      .is("dismissed_at", null);
    if (error) {
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Best-effort: notify the host that a seeker applied to one of their listings.
 * Called as a side-effect AFTER a successful application insert; must never
 * throw or block the apply result.
 *
 * Recipient resolution (host side): listings.host_profile_id -> host_profiles.
 * The notification is addressed by the host's Clerk id (`clerk_user_id`,
 * migration 012) — the identity the feed now queries by. `recipient_user_id`
 * (legacy auth.users FK) is also written when present for back-compat, but is
 * nullable as of migration 014.
 *
 * Returns `{ ok: false }` silently when the listing/host can't be resolved or
 * the host has neither a Clerk id nor an auth.users link.
 */
export async function notifyHostOfApplication(
  clerkToken: string,
  listingId: string,
): Promise<{ ok: boolean }> {
  // A notification is a cross-user write (the seeker creates a row the host
  // reads), so it must go through the service-role client — under the RLS added
  // in migration 043 the seeker's authed client has no INSERT policy. The
  // clerkToken stays in the signature for call-site compatibility.
  void clerkToken;
  try {
    const db = adminClient() as unknown as SupabaseClient;

    const { data: listing, error: listingError } = await db
      .from("listings")
      .select("title, host_profile_id")
      .eq("id", listingId)
      .maybeSingle();
    if (listingError || !listing) {
      return { ok: false };
    }
    const listingRow = listing as {
      title: string | null;
      host_profile_id: string | null;
    };
    const hostProfileId = listingRow.host_profile_id;
    if (!hostProfileId) {
      return { ok: false };
    }
    const listingTitle =
      typeof listingRow.title === "string" ? listingRow.title : "";

    const { data: host, error: hostError } = await db
      .from("host_profiles")
      .select("owner_user_id, clerk_user_id")
      .eq("id", hostProfileId)
      .maybeSingle();
    if (hostError || !host) {
      return { ok: false };
    }
    const hostRow = host as {
      owner_user_id: string | null;
      clerk_user_id: string | null;
    };
    const recipientClerkUserId = hostRow.clerk_user_id;
    const recipientUserId = hostRow.owner_user_id;
    if (!recipientClerkUserId && !recipientUserId) {
      return { ok: false };
    }

    const { error: insertError } = await db.from("notifications").insert({
      recipient_user_id: recipientUserId,
      recipient_clerk_user_id: recipientClerkUserId,
      category: "applications",
      priority: "informational",
      channel: "in_app",
      title: "New application received",
      body: listingTitle
        ? `New application for ${listingTitle}`
        : "You received a new application.",
      subject_type: "listing",
      subject_id: listingId,
      action_url: null,
    });
    return { ok: !insertError };
  } catch {
    return { ok: false };
  }
}
