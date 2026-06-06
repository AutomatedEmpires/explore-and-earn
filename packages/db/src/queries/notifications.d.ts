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
export type NotificationCategory = "applications" | "offers" | "invites" | "billing" | "safety" | "community" | "scheduling" | "verification" | "refunds" | "system";
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
/**
 * Recent notifications for the authed seeker, newest first (limit 50).
 * Dismissed notifications are excluded. Returns an empty array when the seeker
 * has no profile yet or no linked auth.users row.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken({ template: "supabase" })`.
 * @param clerkUserId - Verified Clerk user id from `auth().userId` — never decoded from the token.
 */
export declare function getNotifications(clerkToken: string, clerkUserId: string): Promise<Notification[]>;
/**
 * Mark a single notification read (`read_at = now()`) for the authed seeker.
 * The `recipient_user_id` filter is an app-level ownership guard: a seeker can
 * only mark their own notifications, and the `read_at IS NULL` filter keeps the
 * write idempotent. Best-effort: returns `{ ok: false }` (never throws) when the
 * user is signed out, unresolved, or the write fails.
 */
export declare function markNotificationRead(clerkToken: string, clerkUserId: string, notificationId: string): Promise<{
    ok: boolean;
}>;
/**
 * Count of the authed seeker's unread, non-dismissed notifications (for the
 * header badge). Resilient by design: returns 0 on any failure so a transient
 * error never breaks the seeker shell header.
 */
export declare function getUnreadNotificationCount(clerkToken: string, clerkUserId: string): Promise<number>;
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
export declare function notifyHostOfApplication(clerkToken: string, listingId: string): Promise<{
    ok: boolean;
}>;
