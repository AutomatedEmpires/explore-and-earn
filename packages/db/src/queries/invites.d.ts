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
