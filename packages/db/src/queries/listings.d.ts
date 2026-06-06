import type { BenefitProvision, OpportunityCategory } from "@explore-and-earn/contracts";
export interface ListingRow {
    id: string;
    title: string;
    category: OpportunityCategory;
    location_display: string | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    housing_included: boolean;
    meals_included: boolean;
    compensation_summary: string | null;
    compensation_min_cents: number | null;
    compensation_max_cents: number | null;
    compensation_unit: string | null;
    compensation_currency: string;
    timeline_summary: string | null;
    begins_at: string | null;
    ends_at: string | null;
    published_at: string | null;
    host_profiles: {
        company_name: string;
        attestation_status: string;
    } | null;
}
/** Maps a ListingRow to the DiscoveryListing view-model fields. */
export declare function rowToDiscoveryFields(row: ListingRow): {
    id: string;
    title: string;
    category: "seasonal" | "farm" | "maritime" | "remote" | "mix";
    location: string;
    opportunityWindow: string;
    status: "live" | "draft" | "paused" | "closed" | "archived" | "under_review";
    host: {
        name: string;
        verified: boolean;
    };
    benefits: {
        housing: {
            provision: "provided" | "not_provided";
        };
        meals: {
            provision: "provided" | "not_provided";
        };
        pay: {
            provision: BenefitProvision;
            summary: string;
        };
    };
};
/** Public live listings — no auth required. */
export declare function getPublicListings(): Promise<ListingRow[]>;
/** Single live listing by id — no auth required. */
export declare function getPublicListingById(id: string): Promise<ListingRow | null>;
/**
 * Host's own listings — requires Clerk JWT + verified Clerk user id.
 *
 * Scoped to `host_profile_id` so a host can only read their own listings.
 * `clerkUserId` must come from `auth().userId`.
 */
export declare function getHostListings(clerkToken: string, clerkUserId: string): Promise<ListingRow[]>;
