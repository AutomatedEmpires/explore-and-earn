import type { BenefitTriad, ListingStatus, OpportunityCategory } from "@explore-and-earn/contracts";
export interface ApplyResult {
    readonly ok: boolean;
    readonly error?: string;
}
/**
 * Apply the authed seeker to a listing.
 *
 * App-level ownership guard only (RLS is gated to a separate change). Expected
 * business outcomes are returned as a typed result rather than thrown:
 * - `unauthenticated`  — token had no decodable subject
 * - `profile_not_found` — no seeker_profiles row yet (Clerk webhook pending)
 * - `already_applied`   — unique (listing_id, seeker_profile_id) violation
 * - `cannot_apply_to_own_listing` — host cannot apply to their own listing
 */
export declare function applyToListing(clerkToken: string, clerkUserId: string, listingId: string, coverMessage?: string): Promise<ApplyResult>;
export declare function getSeekerApplicationIds(clerkToken: string, clerkUserId: string): Promise<string[]>;
export interface SeekerApplication {
    readonly id: string;
    readonly listingId: string;
    readonly status: string;
    readonly submittedAt: string;
}
export declare function getSeekerApplications(clerkToken: string, clerkUserId: string): Promise<SeekerApplication[]>;
export interface HostApplication {
    readonly id: string;
    readonly listingId: string;
    readonly listingTitle: string;
    readonly seekerProfileId: string;
    readonly seekerClerkUserId: string;
    readonly status: string;
    readonly coverMessage: string | null;
    readonly submittedAt: string;
}
export declare function getHostApplications(clerkToken: string, clerkUserId: string): Promise<HostApplication[]>;
export declare function getApplicationCountsByListing(clerkToken: string, clerkUserId: string): Promise<Record<string, number>>;
declare const HOST_SETTABLE_STATUSES: readonly ["reviewing", "saved_by_host", "offered", "not_selected"];
export type HostSettableStatus = (typeof HOST_SETTABLE_STATUSES)[number];
export declare function updateApplicationStatus(clerkToken: string, clerkUserId: string, applicationId: string, newStatus: string): Promise<{
    ok: boolean;
    error?: string;
}>;
export interface ApplicationListing {
    readonly id: string;
    readonly title: string;
    readonly category: OpportunityCategory;
    readonly location: string;
    readonly opportunityWindow: string;
    readonly status: ListingStatus;
    readonly host: {
        readonly name: string;
        readonly verified: boolean;
    };
    readonly benefits: BenefitTriad;
}
export type ApplicationWithListing = SeekerApplication & {
    readonly listing: ApplicationListing | null;
};
export declare function getSeekerApplicationsWithListings(clerkToken: string, clerkUserId: string, statuses: string[]): Promise<ApplicationWithListing[]>;
/**
 * Statuses the SEEKER may set from their own /applied dashboard.
 * Only accept/decline a live offer. Host-settable statuses live above.
 */
declare const SEEKER_SETTABLE_STATUSES: readonly ["accepted", "not_selected"];
export type SeekerSettableStatus = (typeof SEEKER_SETTABLE_STATUSES)[number];
/**
 * Richer listing view-model for /applied + offer detail, including the host
 * identity (company name + self-declared verification).
 */
export interface SeekerApplicationListing extends ApplicationListing {
    readonly coverImageUrl: string | null;
}
export type SeekerApplicationWithListing = SeekerApplication & {
    readonly coverMessage: string | null;
    readonly listing: SeekerApplicationListing | null;
};
/**
 * All applications for the authed seeker, newest first, joined to listing + host.
 */
export declare function getApplicationsForSeekerWithListings(clerkToken: string, clerkUserId: string): Promise<SeekerApplicationWithListing[]>;
/**
 * Single application by id, scoped to the authed seeker's ownership.
 */
export declare function getApplicationById(clerkToken: string, clerkUserId: string, applicationId: string): Promise<SeekerApplicationWithListing | null>;
/**
 * Seeker-facing status update: accept or decline a live offer.
 *
 * Validates:
 *  1. newStatus is in SEEKER_SETTABLE_STATUSES
 *  2. Caller owns the application (seeker_profile_id matches)
 *  3. Current application status is 'offered' (can only act on a live offer)
 */
export declare function updateApplicationStatusBySeeker(clerkToken: string, clerkUserId: string, applicationId: string, newStatus: string): Promise<{
    ok: boolean;
    error?: string;
}>;
/**
 * All applications across the authed host's listings, newest first.
 * Delegates to getHostApplications — provided as a named alias so callers
 * explicitly referencing the host-pipeline brief can import by that name.
 */
export declare function getAllApplicationsForHost(clerkToken: string, clerkUserId: string): Promise<HostApplication[]>;
/**
 * A single application enriched with the seeker's display name and bio, for
 * the applicant-detail surface. Ownership is re-checked via getHostApplications
 * (which scopes to the caller's listings) before reading the seeker row.
 *
 * Returns null when the application is not found or the caller does not own the
 * listing the application targets.
 */
export interface ApplicationWithSeekerDetail extends HostApplication {
    readonly seekerDisplayName: string | null;
    readonly seekerBio: string | null;
}
export declare function getApplicationWithSeekerDetail(clerkToken: string, clerkUserId: string, applicationId: string): Promise<ApplicationWithSeekerDetail | null>;
export {};
