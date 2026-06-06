import { authedClient } from "../client";
const NOTIFICATION_COLUMNS = "id, category, priority, channel, title, body, event_id, subject_type, subject_id, action_url, read_at, dismissed_at, created_at";
/** Untyped Supabase handle (see TYPES note above). */
function untypedClient(clerkToken) {
    return authedClient(clerkToken);
}
/**
 * Translate a verified Clerk user id into the recipient's Supabase auth.users
 * UUID (== notifications.recipient_user_id) via seeker_profiles.user_id.
 *
 * Returns null when the seeker has no profile yet OR the profile is not linked
 * to an auth.users row (user_id NULL for Clerk-synced rows — migration 009).
 */
async function resolveRecipientUserId(db, clerkUserId) {
    const { data, error } = await db
        .from("seeker_profiles")
        .select("user_id, clerk_user_id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (error) {
        throw new Error(`resolveRecipientUserId: ${error.message}`);
    }
    const userId = data ? data.user_id : null;
    return userId ?? null;
}
function rowToNotification(raw) {
    const r = raw;
    const str = (v) => (typeof v === "string" ? v : "");
    const nullableStr = (v) => typeof v === "string" ? v : null;
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
export async function getNotifications(clerkToken, clerkUserId) {
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
export async function markNotificationRead(clerkToken, clerkUserId, notificationId) {
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
    }
    catch {
        return { ok: false };
    }
}
/**
 * Count of the authed seeker's unread, non-dismissed notifications (for the
 * header badge). Resilient by design: returns 0 on any failure so a transient
 * error never breaks the seeker shell header.
 */
export async function getUnreadNotificationCount(clerkToken, clerkUserId) {
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
    }
    catch {
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
export async function notifyHostOfApplication(clerkToken, listingId) {
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
        const listingRow = listing;
        const hostProfileId = listingRow.host_profile_id;
        if (!hostProfileId) {
            return { ok: false };
        }
        const listingTitle = typeof listingRow.title === "string" ? listingRow.title : "";
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
        const recipientUserId = host
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
    }
    catch {
        return { ok: false };
    }
}
