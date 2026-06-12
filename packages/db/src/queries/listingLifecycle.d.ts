import "server-only";
import type { ListingStatus } from "@explore-and-earn/contracts";
/** True when `from -> to` is a permitted host listing transition. */
export declare function canTransitionListing(from: ListingStatus, to: ListingStatus): boolean;
export type UpdateListingStatusResult = {
    ok: boolean;
    status?: ListingStatus;
    error?: string;
};
/**
 * Move a listing to a new lifecycle status. Validates the transition and
 * confirms the authed user's host profile owns the listing before writing.
 * Returns { ok: false, error: 'invalid_transition' } for a disallowed edge.
 *
 * `clerkUserId` MUST come from auth().userId (never decoded from the token).
 */
export declare function updateListingStatus(clerkToken: string, clerkUserId: string, listingId: string, newStatus: ListingStatus): Promise<UpdateListingStatusResult>;
export type DuplicateListingResult = {
    ok: boolean;
    newListingId?: string;
    error?: string;
};
/**
 * Duplicate a listing the authed user owns — for recurring seasonal reposts.
 * Clones the editable fields, resets the lifecycle to a fresh draft, and
 * appends " (copy)" to the title. The cover photo URL stays linked. Lifecycle
 * timestamps and role counts fall back to DB defaults, and expires_at is
 * reseeded by the 022 insert trigger (a duplicate gets a fresh 90-day window).
 *
 * `clerkUserId` MUST come from auth().userId.
 */
export declare function duplicateListing(clerkToken: string, clerkUserId: string, listingId: string): Promise<DuplicateListingResult>;
export type ExpireListingsResult = {
    ok: boolean;
    archived: number;
    ids: string[];
    error?: string;
};
/**
 * System-initiated expiry sweep — archive every live listing whose
 * `expires_at` timestamp has passed.
 *
 * Uses the service-role admin client (RLS-bypassing) so the sweep covers
 * every host's listings without needing a Clerk token. The transition is
 * validated against the canonical lifecycle map via `canTransitionListing`
 * before any write is attempted.
 *
 * Idempotent: only listings currently in `status = 'live'` are updated, so
 * running the sweep multiple times has no additional effect.
 *
 * Intended to be called exclusively by `GET /api/cron/expire-listings`.
 */
export declare function expireListings(serviceRoleKey?: string): Promise<ExpireListingsResult>;
