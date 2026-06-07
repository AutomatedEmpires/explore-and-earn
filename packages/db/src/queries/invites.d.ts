import "server-only";
import type { BenefitTriad, ListingStatus, OpportunityCategory } from "@explore-and-earn/contracts";
/**
 * A host invite as the seeker sees it. `status` stays a plain string (the
 * persisted lifecycle vocabulary is broader than any local union).
 */
export interface SeekerInvite {
    readonly id: string;
    readonly listingId: string;
    readonly hostProfileId: string;
    readonly status: string;
    readonly message: string | null;
    /** ISO-8601 creation timestamp. */
    readonly createdAt: string;
}
/**
 * Minimal listing view-model carried alongside an invite. Structurally a subset
 * of the Discovery lane's DiscoveryListing (composed from the frozen
 * @explore-and-earn/contracts registries) so it maps cleanly into LifecycleList
 * / DiscoveryCard WITHOUT importing the frontend type (which would create a
 * packages/db -> apps/web import cycle). Same approach as ApplicationListing,
 * but the host name/verification ARE populated here from the invite's embedded
 * host_profiles row.
 */
export interface InviteListing {
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
 * An invite joined to its listing view-model, for the /invites surface.
 * `listing` is null when the embedded listing could not be resolved.
 */
export interface InviteWithListing {
    readonly invite: SeekerInvite;
    readonly listing: InviteListing | null;
}
/** Seeker-facing response verbs accepted by respondToInvite. */
export type InviteResponse = "accepted" | "declined";
/**
 * All non-withdrawn invites for the authed seeker, newest first, each joined to
 * its listing view-model and inviting host.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from the token.
 * App-level ownership guard only (RLS is gated to a separate change): every
 * query is scoped by the resolved seeker_profile_id. UNTYPED-client bridge
 * because the invites table predates the committed types.gen.ts.
 *
 * Returns an empty array when the seeker has no profile yet or no invites.
 */
export declare function getSeekerInvites(clerkToken: string, clerkUserId: string): Promise<InviteWithListing[]>;
/**
 * The authed seeker accepts or declines an invite.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from the token.
 * App-level ownership guard only: the invite is scoped by id + the resolved
 * seeker_profile_id. The seeker-facing verb is mapped to its persisted lifecycle
 * value and applied through valid transitions (see RESPONSE_TARGET / invitePath).
 *
 * Business outcomes are returned as a typed result rather than thrown:
 * - `profile_not_found`  — no seeker_profiles row yet
 * - `not_found`          — no matching invite owned by this seeker
 * - `already_responded`  — invite is no longer in a respondable state
 */
export declare function respondToInvite(clerkToken: string, clerkUserId: string, inviteId: string, response: InviteResponse): Promise<{
    ok: boolean;
    error?: string;
}>;
/** A seeker match returned by the invite search surface. */
export interface SeekerSearchResult {
    readonly seekerProfileId: string;
    readonly displayName: string | null;
    readonly bio: string | null;
}
/**
 * Search seeker profiles by display name or bio for the invite surface.
 *
 * Input is sanitized (trimmed, max 100 chars, `%` stripped). Results capped at
 * 20. Returns empty array when the host has no profile or the query is empty
 * after sanitization.
 *
 * `clerkUserId` MUST come from auth().userId.
 */
export declare function searchSeekersForInvite(clerkToken: string, clerkUserId: string, query: string): Promise<SeekerSearchResult[]>;
/** An invite as the host sees it — minimal view-model for the /host/invites surface. */
export interface HostInvite {
    readonly id: string;
    readonly listingId: string;
    readonly listingTitle: string;
    readonly seekerProfileId: string;
    readonly seekerDisplayName: string | null;
    readonly status: string;
    readonly message: string | null;
    readonly createdAt: string;
}
/**
 * All invites sent by the authed host, newest first.
 *
 * `clerkUserId` MUST come from auth().userId.
 * Returns an empty array when the host has no profile or no invites yet.
 */
export declare function getHostInvites(clerkToken: string, clerkUserId: string): Promise<HostInvite[]>;
/**
 * Create a host-initiated invite. Status always starts at `created` (the DB
 * lifecycle trigger rejects any other initial value).
 *
 * Ownership guard: the caller must own the listing (via host_profile_id).
 * Deduplication: a unique violation on (listing_id, seeker_profile_id)
 * is returned as `{ ok: false, error: "already_invited" }`.
 *
 * `clerkUserId` MUST come from auth().userId.
 */
export declare function createInvite(clerkToken: string, clerkUserId: string, listingId: string, seekerProfileId: string, message?: string): Promise<{
    ok: boolean;
    inviteId?: string;
    error?: string;
}>;
