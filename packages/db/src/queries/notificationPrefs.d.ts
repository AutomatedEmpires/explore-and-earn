import "server-only";
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
export declare const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs;
export declare function getNotificationPrefs(clerkToken: string, clerkUserId: string): Promise<NotificationPrefs>;
export interface SaveNotificationPrefsResult {
    readonly ok: boolean;
    readonly error?: string;
}
export declare function saveNotificationPrefs(clerkToken: string, clerkUserId: string, prefs: NotificationPrefs): Promise<SaveNotificationPrefsResult>;
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
export declare function updateNotificationPrefs(clerkToken: string, clerkUserId: string, prefs: NotificationPrefsPatch): Promise<SaveNotificationPrefsResult>;
