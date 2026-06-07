import { authedClient } from "../client";
/** Safe defaults: every email is ON unless the seeker turns it off. */
export const DEFAULT_NOTIFICATION_PREFS = {
    emailOnInvite: true,
    emailOnStatusChange: true,
    emailOnMessage: true,
};
function untypedClient(clerkToken) {
    return authedClient(clerkToken);
}
function asBool(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}
function rowToPrefs(row) {
    if (!row)
        return DEFAULT_NOTIFICATION_PREFS;
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
export async function getNotificationPrefs(clerkToken, clerkUserId) {
    if (!clerkUserId)
        return DEFAULT_NOTIFICATION_PREFS;
    try {
        const db = untypedClient(clerkToken);
        const { data, error } = await db
            .from("seeker_profiles")
            .select("email_on_invite, email_on_status_change, email_on_message")
            .eq("clerk_user_id", clerkUserId)
            .maybeSingle();
        if (error || !data)
            return DEFAULT_NOTIFICATION_PREFS;
        return rowToPrefs(data);
    }
    catch {
        return DEFAULT_NOTIFICATION_PREFS;
    }
}
/**
 * Persist the seeker's notification preferences by Clerk user id. Scoped to the
 * seeker's own row (clerk_user_id from auth().userId).
 */
export async function saveNotificationPrefs(clerkToken, clerkUserId, prefs) {
    if (!clerkUserId)
        return { ok: false, error: "unauthenticated" };
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
        if (error)
            return { ok: false, error: error.message };
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "unknown" };
    }
}
