import { authedClient } from "../client";
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
/**
 * Partially update the seeker's notification preferences. Only the keys
 * present in `prefs` are written; others are untouched.
 */
export async function updateNotificationPrefs(clerkToken, clerkUserId, prefs) {
    if (!clerkUserId)
        return { ok: false, error: "unauthenticated" };
    const patch = {};
    if (prefs.emailOnInvite !== undefined)
        patch.email_on_invite = prefs.emailOnInvite;
    if (prefs.emailOnStatusChange !== undefined)
        patch.email_on_status_change = prefs.emailOnStatusChange;
    if (prefs.emailOnMessage !== undefined)
        patch.email_on_message = prefs.emailOnMessage;
    if (Object.keys(patch).length === 0)
        return { ok: true };
    try {
        const db = untypedClient(clerkToken);
        const { error } = await db
            .from("seeker_profiles")
            .update(patch)
            .eq("clerk_user_id", clerkUserId);
        if (error)
            return { ok: false, error: error.message };
        return { ok: true };
    }
    catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : "unknown",
        };
    }
}
