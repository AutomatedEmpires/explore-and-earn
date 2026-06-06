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
 */
export declare function applyToListing(clerkToken: string, clerkUserId: string, listingId: string, coverMessage?: string): Promise<ApplyResult>;
/**
 * Listing ids the authed seeker has applied to (status != 'withdrawn').
 * Returns an empty array when the seeker has no profile yet or no applications.
 */
export declare function getSeekerApplicationIds(clerkToken: string, clerkUserId: string): Promise<string[]>;
/**
 * A seeker's own submitted application, shaped for the /applied lifecycle UI.
 * `status` stays a plain string here (the persisted lifecycle vocabulary is
 * broader than the local view-model union); the UI narrows it for display.
 */
export interface SeekerApplication {
    readonly id: string;
    readonly listingId: string;
    readonly status: string;
    /** ISO-8601 submission timestamp. */
    readonly submittedAt: string;
}
/**
 * Full application records for the authed seeker, newest first.
 *
 * `clerkUserId` must come from `auth().userId` (already verified by Clerk
 * middleware) — never decode it from the token. Same safe pattern as the
 * savedListings functions.
 *
 * Returns an empty array when the seeker has no profile yet or no applications.
 *
 * TYPES BRIDGE: `submitted_at` predates the committed types.gen.ts (same bridge
 * as resolveSeekerProfileId), so this read goes through an UNTYPED view of the
 * authed client until the generated types are regenerated.
 */
export declare function getSeekerApplications(clerkToken: string, clerkUserId: string): Promise<SeekerApplication[]>;
/**
 * A single application as the HOST sees it: the application row joined up
 * through its listing to confirm host ownership, plus the applicant's Clerk id.
 */
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
/**
 * All applications across the authed host's listings, newest first.
 *
 * Scoping is an app-level ownership guard (RLS for applications is gated to a
 * separate change): we constrain to host_profiles.clerk_user_id = $clerkUserId.
 * Uses the UNTYPED client cast (same pattern as resolveSeekerProfileId) because
 * the generated types predate the clerk_user_id columns.
 *
 * Primary path uses the PostgREST embedded join; if PostgREST rejects the embed
 * (named blocker in the build brief) we fall back to discrete queries.
 */
export declare function getHostApplications(clerkToken: string, clerkUserId: string): Promise<HostApplication[]>;
/**
 * Application counts keyed by listing id for the authed host, e.g.
 * { [listingId]: count }. Derived from getHostApplications so the ownership
 * guard and embed/fallback behaviour stay in one place.
 */
export declare function getApplicationCountsByListing(clerkToken: string, clerkUserId: string): Promise<Record<string, number>>;
/**
 * Statuses a host is permitted to set on an application from the dashboard.
 * This is the host-facing decision vocabulary; seeker-facing values such as
 * 'applied' and 'withdrawn' are deliberately NOT settable here.
 */
declare const HOST_SETTABLE_STATUSES: readonly ["reviewing", "saved_by_host", "offered", "not_selected"];
export type HostSettableStatus = (typeof HOST_SETTABLE_STATUSES)[number];
/**
 * Host changes the status of a single application.
 *
 * Ownership is enforced in application code (RLS for applications is gated to a
 * separate change), using the same discrete-query pattern as the
 * getHostApplications fallback: resolve the caller's host_profiles id(s), load
 * the target application's listing, and confirm that listing belongs to the
 * host before writing. `clerkUserId` MUST come from auth().userId (already
 * verified by Clerk) and is never decoded from the token.
 *
 * Business outcomes are returned as a typed result rather than thrown:
 * - `invalid_status` — newStatus is not a host-settable value
 * - `profile_not_found` — caller has no host_profiles row
 * - `not_found` — application does not exist
 * - `forbidden` — application's listing is not owned by the caller
 */
export declare function updateApplicationStatus(clerkToken: string, clerkUserId: string, applicationId: string, newStatus: string): Promise<{
    ok: boolean;
    error?: string;
}>;
/**
 * Minimal listing view-model carried alongside a seeker application for the
 * status-bucket surfaces. Structurally a subset of the Discovery lane's
 * DiscoveryListing (composed here from the frozen @explore-and-earn/contracts
 * registries) so values map cleanly into LifecycleList / DiscoveryCard WITHOUT
 * importing the frontend DiscoveryListing type (that would create a
 * packages/db -> apps/web import cycle). Only the fields the bucket cards read
 * are produced; the optional DiscoveryListing fields (cover, conditional
 * badges, match score, coordinates) are intentionally omitted.
 */
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
/**
 * A seeker application joined to its listing view-model, for the status-bucket
 * pages (/offered, /accepted, /not-selected). `listing` is null when the
 * embedded listing could not be resolved (e.g. a deleted listing).
 */
export type ApplicationWithListing = SeekerApplication & {
    readonly listing: ApplicationListing | null;
};
/**
 * Applications for the authed seeker filtered to the given statuses, each joined
 * to its listing view-model for the status-bucket surfaces (/offered,
 * /accepted, /not-selected). Newest first.
 *
 * `clerkUserId` MUST come from auth().userId (already verified by Clerk) — never
 * decoded from the token. Same UNTYPED-client bridge as getSeekerApplications
 * (submitted_at / clerk_user_id predate the committed types.gen.ts).
 *
 * Returns an empty array when the seeker has no profile yet, no matching
 * applications, or an empty `statuses` list.
 */
export declare function getSeekerApplicationsWithListings(clerkToken: string, clerkUserId: string, statuses: string[]): Promise<ApplicationWithListing[]>;
export {};
