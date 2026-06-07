/**
 * Listing counts keyed by DB status (live, draft, paused, closed, archived,
 * under_review). Only statuses that appear in the host's listings are present.
 */
export interface ListingStatusCounts {
    readonly [status: string]: number;
}
/**
 * Applications submitted this calendar month, keyed by status.
 * Empty when the host has no listings or no recent applications.
 */
export interface ApplicationsByStage {
    readonly [status: string]: number;
}
export interface HostDashboardStats {
    /** Total listing counts per DB status (live, draft, paused…). */
    readonly listingsByStatus: ListingStatusCounts;
    /** Applications submitted in the current calendar month, grouped by status. */
    readonly applicationsThisMonth: ApplicationsByStage;
    /**
     * Count of items awaiting host action: applications in status `applied`
     * (not yet reviewed) plus invites in status `delivered` or `viewed`.
     */
    readonly pendingActions: number;
}
/**
 * Dashboard-level analytics for the authed host.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from a token.
 * Returns zeroed stats when the host has no profile row yet.
 */
export declare function getHostDashboardStats(clerkToken: string, clerkUserId: string): Promise<HostDashboardStats>;
/** A single entry in the recent activity feed. */
export interface RecentActivity {
    readonly id: string;
    /** Discriminant for the feed item icon / colour. */
    readonly type: "application" | "invite_sent" | "listing_published";
    /** Short human-readable description of the activity. */
    readonly description: string;
    /** ISO-8601 timestamp. */
    readonly timestamp: string;
}
/**
 * The last 10 notable activities for the authed host across applications and
 * invites, sorted newest-first.
 *
 * `clerkUserId` MUST come from auth().userId.
 */
export declare function getRecentActivityForHost(clerkToken: string, clerkUserId: string): Promise<RecentActivity[]>;
