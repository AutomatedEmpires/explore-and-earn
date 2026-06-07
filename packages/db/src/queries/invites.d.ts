import "server-only";
import type { BenefitTriad, ListingStatus, OpportunityCategory } from "@explore-and-earn/contracts";
export interface SeekerInvite {
    readonly id: string;
    readonly listingId: string;
    readonly hostProfileId: string;
    readonly status: string;
    readonly message: string | null;
    readonly createdAt: string;
}
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
export interface InviteWithListing {
    readonly invite: SeekerInvite;
    readonly listing: InviteListing | null;
}
export type InviteResponse = "accepted" | "declined";
export declare function getSeekerInvites(clerkToken: string, clerkUserId: string): Promise<InviteWithListing[]>;
export declare function respondToInvite(clerkToken: string, clerkUserId: string, inviteId: string, response: InviteResponse): Promise<{
    ok: boolean;
    error?: string;
}>;
export interface SeekerSearchResult {
    readonly seekerProfileId: string;
    readonly displayName: string | null;
    readonly bio: string | null;
}
export declare function searchSeekersForInvite(clerkToken: string, clerkUserId: string, query: string): Promise<SeekerSearchResult[]>;
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
export declare function getHostInvites(clerkToken: string, clerkUserId: string): Promise<HostInvite[]>;
export interface CreateInviteParams {
    readonly hostProfileId: string;
    readonly seekerProfileId: string;
    readonly listingId: string;
    readonly message?: string;
    readonly invitedByUserId?: string;
}
/**
 * Create a host-initiated invite. Status always starts at `created` because the
 * current invite lifecycle constraint rejects non-seeded values such as
 * `pending`.
 *
 * Ownership is validated in the server action before calling this function.
 * Deduplication: a unique violation on (listing_id, seeker_profile_id)
 * is returned as `{ ok: false, error: "already_invited" }`.
 */
export declare function createInvite(clerkToken: string, params: CreateInviteParams): Promise<{
    ok: boolean;
    inviteId?: string;
    error?: string;
}>;
