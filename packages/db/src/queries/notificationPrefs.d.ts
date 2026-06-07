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
export declare const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs;
/**
 * Read the seeker's notification preferences by Clerk user id. Best-effort:
 * returns all-ON defaults when the profile/columns can't be resolved, so a
 * lookup failure never silently suppresses a notification.
 */
export declare function getNotificationPrefs(clerkToken: string, clerkUserId: string): Promise<NotificationPrefs>;
export interface SaveNotificationPrefsResult {
    readonly ok: boolean;
    readonly error?: string;
}
/**
 * Persist the seeker's notification preferences by Clerk user id. Scoped to the
 * seeker's own row (clerk_user_id from auth().userId).
 */
export declare function saveNotificationPrefs(clerkToken: string, clerkUserId: string, prefs: NotificationPrefs): Promise<SaveNotificationPrefsResult>;
