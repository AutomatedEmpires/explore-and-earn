import { authedClient } from "../client";
const NOTIFICATION_COLUMNS = "id, category, priority, channel, title, body, event_id, subject_type, subject_id, action_url, read_at, dismissed_at, created_at";
/** Untyped Supabase handle (see TYPES note above). */
function untypedClient(clerkToken) {
    return authedClient(clerkToken);
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
 * Dismissed notifications are excluded. Returns an empty array when signed out.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken({ template: "supabase" })`.
 * @param clerkUserId - Verified Clerk user id from `auth().userId` — never decoded from the token.
 */
export async function getNotifications(clerkToken, clerkUserId) {
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
export async function markNotificationRead(clerkToken, clerkUserId, notificationId) {
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
    }
    catch {
        return { ok: false };
    }
}
/**
 * Mark every unread notification for the authed seeker as read
 * (`read_at = now()`), scoped by `recipient_clerk_user_id`. Called when the
 * seeker opens the notifications page so the header unread badge clears.
 * Best-effort: returns `{ ok: false }` (never throws) on any failure.
 */
export async function markAllNotificationsRead(clerkToken, clerkUserId) {
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
 * Recipient resolution (host side): listings.host_profile_id -> host_profiles.
 * The notification is addressed by the host's Clerk id (`clerk_user_id`,
 * migration 012) — the identity the feed now queries by. `recipient_user_id`
 * (legacy auth.users FK) is also written when present for back-compat, but is
 * nullable as of migration 014.
 *
 * Returns `{ ok: false }` silently when the listing/host can't be resolved or
 * the host has neither a Clerk id nor an auth.users link.
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
            .select("owner_user_id, clerk_user_id")
            .eq("id", hostProfileId)
            .maybeSingle();
        if (hostError || !host) {
            return { ok: false };
        }
        const hostRow = host;
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
    }
    catch {
        return { ok: false };
    }
}
