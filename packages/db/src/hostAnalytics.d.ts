import "server-only";
export interface ListingStatusCounts {
    readonly [status: string]: number;
}
export interface ApplicationsByStage {
    readonly [status: string]: number;
}
export interface HostDashboardStats {
    readonly listingsByStatus: ListingStatusCounts;
    readonly applicationsThisMonth: ApplicationsByStage;
    readonly pendingActions: number;
}
export interface HostPerListingStats {
    readonly listingId: string;
    readonly listingTitle: string;
    readonly listingStatus: string;
    readonly applicationsByStatus: ApplicationsByStage;
    readonly totalApplications: number;
    readonly invitesSent: number;
    readonly invitesAccepted: number;
}
export interface HostAnalytics {
    readonly totalApplicationsByStatus: ApplicationsByStage;
    readonly activeListingCount: number;
    /** Accepted invites divided by total sent, from 0 to 1. */
    readonly inviteAcceptanceRate: number;
    readonly perListingStats: HostPerListingStats[];
}
/**
 * Full host analytics for dashboard UI wiring.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from a token.
 * Returns zeroed analytics when the host has no profile row yet.
 */
export declare function getHostAnalytics(clerkToken: string, clerkUserId: string): Promise<HostAnalytics>;
export declare function getHostDashboardStats(clerkToken: string, clerkUserId: string): Promise<HostDashboardStats>;
export interface RecentActivity {
    readonly id: string;
    readonly type: "application" | "invite_sent" | "listing_published";
    readonly description: string;
    readonly timestamp: string;
}
export declare function getRecentActivityForHost(clerkToken: string, clerkUserId: string): Promise<RecentActivity[]>;
