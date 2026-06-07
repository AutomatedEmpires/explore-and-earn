import "server-only";
/** Marketplace-wide counts for the founder admin dashboard. */
export interface MarketplaceStats {
    readonly totalListings: number;
    readonly liveListings: number;
    readonly draftListings: number;
    readonly underReviewListings: number;
    readonly totalApplications: number;
    readonly pendingApplications: number;
    readonly acceptedApplications: number;
    readonly totalHosts: number;
    readonly verifiedHosts: number;
    readonly totalSeekers: number;
}
/**
 * Live marketplace counts for the admin dashboard.
 *
 * Status/attestation vocabularies:
 *   - pendingApplications  = applications with status 'applied' (awaiting first review)
 *   - acceptedApplications = applications with status 'accepted'
 *   - verifiedHosts        = host_profiles with attestation_status 'attested'
 *   - totalSeekers         = count of seeker_profiles rows
 */
export declare function getMarketplaceStats(serviceRoleToken: string): Promise<MarketplaceStats>;
/** One listing row for the moderation table. */
export interface AdminListingRow {
    readonly id: string;
    readonly title: string;
    readonly category: string;
    readonly status: string;
    readonly publishedAt: string | null;
    readonly hostCompanyName: string;
}
/**
 * Every listing across all statuses (draft / under_review / live / paused /
 * closed / archived), newest first, with the owning host's company name.
 */
export declare function getAllListingsForModeration(serviceRoleToken: string): Promise<AdminListingRow[]>;
/** One host row for the verification table. */
export interface AdminHostRow {
    readonly id: string;
    readonly companyName: string;
    readonly clerkUserId: string;
    readonly attestationStatus: string;
    readonly listingCount: number;
}
/**
 * Every host_profiles row, newest first, with a per-host listing count. The
 * count is tallied in JS from a single listings scan (the admin set is small
 * enough that one pass beats N per-host count queries).
 */
export declare function getAllHostProfiles(serviceRoleToken: string): Promise<AdminHostRow[]>;
/** One application row for the read-only pipeline table. */
export interface AdminApplicationRow {
    readonly id: string;
    readonly seekerClerkUserId: string;
    readonly listingTitle: string;
    readonly status: string;
    readonly createdAt: string;
}
/**
 * The most recent applications (default 50), newest first by created_at, joined
 * to the listing title and the applicant's Clerk user id. Read-only view.
 */
export declare function getRecentApplications(serviceRoleToken: string, limit?: number): Promise<AdminApplicationRow[]>;
/**
 * Approve a listing: set status = 'live', and backfill published_at = now()
 * only when it has never been set (first approval). Two writes: an
 * unconditional status update, then a published_at update filtered to rows
 * where published_at IS NULL.
 */
export declare function adminApproveListing(serviceRoleToken: string, listingId: string): Promise<{
    ok: boolean;
    error?: string;
}>;
/**
 * Reject a listing: set status = 'closed'. `reason` is accepted for API parity
 * with the server action but is not persisted — the listings table has no
 * rejection-reason column (006_listings.sql) and adding one would touch the
 * schema, which is out of scope for this change.
 */
export declare function adminCloseListing(serviceRoleToken: string, listingId: string, reason?: string): Promise<{
    ok: boolean;
    error?: string;
}>;
/**
 * Set a host's attestation_status to 'attested' or 'not_attested'.
 *
 * Canonical vocabulary (migration 003 CHECK constraint):
 *   not_attested | attested | attested_stale | withdrawn
 * 'attested' = admin has verified the host; 'not_attested' = reverting to
 * the default unverified state. 'attested_stale' and 'withdrawn' are set by
 * the trust lifecycle trigger, not by admin action.
 */
export declare function adminSetHostAttestationStatus(serviceRoleToken: string, hostProfileId: string, attestationStatus: "attested" | "not_attested"): Promise<{
    ok: boolean;
    error?: string;
}>;
