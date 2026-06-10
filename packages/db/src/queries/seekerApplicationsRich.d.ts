import "server-only";
import type { SeekerApplicationListing } from "./applications";
/**
 * One application, joined to its listing + host, plus the lifecycle timestamps
 * the /applied detail timeline needs. Superset of SeekerApplicationWithListing
 * without coupling to that type's definition.
 */
export interface RichSeekerApplication {
    readonly id: string;
    readonly listingId: string;
    readonly status: string;
    readonly submittedAt: string;
    readonly reviewedAt: string | null;
    readonly decidedAt: string | null;
    readonly coverMessage: string | null;
    readonly listing: SeekerApplicationListing | null;
}
/**
 * All applications for the authed seeker, newest first, joined to listing +
 * host, including reviewed_at / decided_at for the status timeline.
 */
export declare function getSeekerApplicationsRich(clerkToken: string, clerkUserId: string): Promise<RichSeekerApplication[]>;
export interface WithdrawApplicationResult {
    readonly ok: boolean;
    readonly error?: string;
}
/**
 * Withdraw the authed seeker's own application.
 *
 * App-level guards (RLS is gated to a separate change):
 * - profile_not_found — no seeker_profiles row
 * - not_found         — application id does not exist (or not visible)
 * - forbidden         — application belongs to a different seeker
 * - invalid_status    — only an `applied` application may be withdrawn
 *
 * applied -> withdrawn is a permitted lifecycle transition, so the DB-side
 * lifecycle trigger accepts the update.
 */
export declare function withdrawApplication(clerkToken: string, clerkUserId: string, applicationId: string): Promise<WithdrawApplicationResult>;
