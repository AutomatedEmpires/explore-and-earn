import "server-only";
import type { OpportunityCategory } from "@explore-and-earn/contracts";
export declare function saveListing(clerkToken: string, clerkUserId: string, listingId: string): Promise<{
    ok: boolean;
}>;
export declare function saveListingWithStatus(clerkToken: string, clerkUserId: string, listingId: string): Promise<{
    ok: boolean;
    alreadySaved: boolean;
}>;
export declare function unsaveListing(clerkToken: string, clerkUserId: string, listingId: string): Promise<{
    ok: boolean;
}>;
export declare function getSavedListingIds(clerkToken: string, clerkUserId: string): Promise<string[]>;
/** Benefit sub-item shape used by SavedListingDetail. */
export interface SavedListingBenefit {
    readonly provision: string;
    readonly summary?: string;
}
/** Full saved listing detail for the /saved card grid. */
export interface SavedListingDetail {
    readonly id: string;
    readonly title: string;
    readonly category: OpportunityCategory;
    readonly location: string;
    readonly opportunityWindow: string;
    readonly status: string;
    readonly host: {
        readonly name: string;
        readonly verified: boolean;
    };
    readonly benefits: {
        readonly housing: SavedListingBenefit;
        readonly meals: SavedListingBenefit;
        readonly pay: SavedListingBenefit;
    };
    readonly coverImageUrl: string | undefined;
    /** True when the seeker already has a non-withdrawn application for this listing. */
    readonly alreadyApplied: boolean;
}
/**
 * Saved listings joined to full live-listing detail + host, with an
 * `alreadyApplied` flag computed from the applications table.
 *
 * Returns an empty array when the seeker has no profile or no saved listings.
 */
export declare function getSavedListingsWithDetails(clerkToken: string, clerkUserId: string): Promise<SavedListingDetail[]>;
