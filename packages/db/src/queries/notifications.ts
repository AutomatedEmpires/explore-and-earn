import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Notifications data access for the seeker notification feed + unread badge,
 * plus the host-facing "new application" side-effect insert.
 *
 * IDENTITY MODEL (read this before touching the queries):
 *   `notifications.recipient_user_id` is `NOT NULL references auth.users(id)`
 *   (migration 008) — it is the Supabase-side user UUID, NOT the Clerk user id
 *   (`user_2abc...`). Auth, however, is owned by Clerk (issue #105): the JWT
 *   `sub` claim minted by the "supabase" Clerk template is the CLERK id, and
 *   every existing query (see applications.ts / savedListings.ts) scopes by
 *   `clerk_user_id`. So to read/write notifications we must first translate the
 *   verified Clerk user id into the recipient's auth.users UUID:
 *     - seeker recipient -> seeker_profiles.user_id    (where clerk_user_id = $clerk)
 *     - host   recipient -> host_profiles.owner_user_id (via listings.host_profile_id)
 *   Migration 009 made `seeker_profiles.user_id` NULLABLE for Clerk-synced
 *   rows, so this link can be NULL; when it is, we cannot resolve a recipient
 *   and degrade gracefully (empty feed / zero count / skipped insert) rather
 *   than throwing. See the PR description for the backfill follow-up.
 *
 * SECURITY: RLS is not yet enabled; `authedClient()` talks to PostgREST with
 * the anon key + the caller's Clerk JWT. Every query is therefore scoped in
 * application code by the resolved `recipient_user_id`. Keep these manual
 * filters even once RLS lands; they are defense in depth.
 *
 * TYPES: `packages/db/src/types.gen.ts` is still a placeholder
 * (`GeneratedDatabase = Record<string, never>`), so we cast to an untyped
 * `SupabaseClient` handle for `.from(...)` calls and narrow rows locally,
 * mirroring the other query modules. Drop the cast once generated types exist.
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

/**
 * Translate a verified Clerk user id into the recipient's Supabase auth.users
 * UUID (== notifications.recipient_user_id) via seeker_profiles.user_id.
 *
 * Returns null when the seeker has no profile yet OR the profile is not linked
 * to an auth.users row (user_id NULL for Clerk-synced rows — migration 009).
 */
async function resolveRecipientUserId(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("seeker_profiles")
    .select("user_id, clerk_user_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) {
    throw new Error(`resolveRecipientUserId: ${error.message}`);
  }
  const userId = data ? (data as { user_id: string | null }).user_id : null;
  return userId ?? null;
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
 * Dismissed notifications are excluded. Returns an empty array when the seeker
 * has no profile yet or no linked auth.users row.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken({ template: "supabase" })`.
 * @param clerkUserId - Verified Clerk user id from `auth().userId` — never decoded from the token.
 */
export async function getNotifications(
  clerkToken: string,
  clerkUserId: string,
): Promise<Notification[]> {
  const db = untypedClient(clerkToken);
  const recipientUserId = await resolveRecipientUserId(db, clerkUserId);
  if (!recipientUserId) {
    return [];
  }

  const { data, error } = await db
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("recipient_user_id", recipientUserId)
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
 * The `recipient_user_id` filter is an app-level ownership guard: a seeker can
 * only mark their own notifications, and the `read_at IS NULL` filter keeps the
 * write idempotent. Best-effort: returns `{ ok: false }` (never throws) when the
 * user is signed out, unresolved, or the write fails.
 */
export async function markNotificationRead(
  clerkToken: string,
  clerkUserId: string,
  notificationId: string,
): Promise<{ ok: boolean }> {
  try {
    const db = untypedClient(clerkToken);
    const recipientUserId = await resolveRecipientUserId(db, clerkUserId);
    if (!recipientUserId) {
      return { ok: false };
    }

    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_user_id", recipientUserId)
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
    const db = untypedClient(clerkToken);
    const recipientUserId = await resolveRecipientUserId(db, clerkUserId);
    if (!recipientUserId) {
      return 0;
    }

    const { count, error } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", recipientUserId)
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
 * Recipient resolution (host side): listings.host_profile_id ->
 * host_profiles.owner_user_id (== auth.users.id == recipient_user_id). We use
 * owner_user_id (the canonical auth.users FK from migration 003) rather than a
 * Clerk id because notifications.recipient_user_id is a NOT NULL FK to
 * auth.users.
 *
 * Returns `{ ok: false }` silently when the listing/host can't be resolved or
 * the host has no linked auth.users row (owner_user_id NULL). See PR notes.
 */
export async function notifyHostOfApplication(
  clerkToken: string,
  listingId: string,
): Promise<{ ok: boolean }> {
  try {
    const db = untypedClient(clerkToken);

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
      .select("owner_user_id")
      .eq("id", hostProfileId)
      .maybeSingle();
    if (hostError || !host) {
      return { ok: false };
    }
    // TODO(notifications): owner_user_id can be NULL for Clerk-synced host
    // profiles not yet backfilled with an auth.users link. Once a host
    // clerk->auth backfill (or a notifications.clerk_user_id column) lands,
    // resolve the recipient through that path instead of skipping.
    const recipientUserId = (host as { owner_user_id: string | null })
      .owner_user_id;
    if (!recipientUserId) {
      return { ok: false };
    }

    const { error: insertError } = await db.from("notifications").insert({
      recipient_user_id: recipientUserId,
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
