import type { BenefitProvision, CompensationUnit, OpportunityCategory } from "@explore-and-earn/contracts";
export interface ListingRow {
    id: string;
    title: string;
    category: OpportunityCategory;
    description: string | null;
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
    category: "farm" | "maritime" | "remote" | "seasonal" | "mix";
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
/** Public live listings \u2014 no auth required. */
export declare function getPublicListings(): Promise<ListingRow[]>;
/** Single live listing by id \u2014 no auth required. */
export declare function getPublicListingById(id: string): Promise<ListingRow | null>;
/**
 * Batch variant of getPublicListingById: fetch many live listings in a single
 * query instead of one round-trip per id (eliminates the N+1 on the
 * saved/applied/messages surfaces). No auth required (public listings).
 *
 * - Returns [] for an empty id list — PostgREST `.in(...)` with an empty array
 *   is invalid, so the guard is required.
 * - Filters on status "live", matching getPublicListingById. (There is no
 *   "published" status in this schema; "live" is the published state — see
 *   contracts LISTING_STATUS / supabase/migrations/006_listings.sql.)
 * - Result order is NOT guaranteed; callers that need a specific order should
 *   join the rows back by id (e.g. via a Map).
 */
export declare function getPublicListingsByIds(ids: string[]): Promise<ListingRow[]>;
/**
 * Host's own listings \u2014 requires Clerk JWT + verified Clerk user id.
 *
 * Scoped to `host_profile_id` so a host can only read their own listings.
 * `clerkUserId` must come from `auth().userId`.
 */
export declare function getHostListings(clerkToken: string, clerkUserId: string): Promise<ListingRow[]>;
/**
 * Field shape accepted by createListing / updateListing.
 *
 * Money note: `payMin` / `payMax` are MAJOR currency units (e.g. dollars), not
 * cents. They are converted to the integer `compensation_*_cents` columns via
 * Math.round(amount * 100) to satisfy the 006_listings.sql CHECK (>= 0).
 *
 * Housing / Meals note: 006_listings.sql has no free-text housing/meals column \u2014
 * only the boolean `housing_included` / `meals_included` flags. A provided or
 * partial provision (or any non-empty description) flips the flag to true; the
 * free-text description itself is NOT persisted yet. Flagged for schema
 * follow-up.
 */
export interface ListingWriteFields {
    title?: string;
    category?: OpportunityCategory;
    locationName?: string | null;
    housingProvision?: BenefitProvision;
    housingDescription?: string | null;
    mealsProvision?: BenefitProvision;
    mealsDescription?: string | null;
    payMin?: number | null;
    payMax?: number | null;
    payCurrency?: string | null;
    payPeriod?: CompensationUnit | null;
    summary?: string | null;
    startDate?: string | null;
    endDate?: string | null;
}
/**
 * Create a draft listing owned by the authenticated host.
 *
 * `clerkUserId` must come from `auth().userId` \u2014 never decoded from the token.
 * The listing is always inserted with status 'draft'.
 */
export declare function createListing(clerkToken: string, clerkUserId: string, fields: ListingWriteFields): Promise<{
    ok: boolean;
    listingId?: string;
    error?: string;
}>;
/**
 * Update an existing listing the caller owns.
 *
 * Ownership is enforced directly in the query:
 * UPDATE ... WHERE id = listingId AND host_profile_id = <caller's profile>.
 * A row the host does not own simply matches nothing and returns an error.
 *
 * `clerkUserId` must come from `auth().userId`.
 */
export declare function updateListing(clerkToken: string, clerkUserId: string, listingId: string, fields: ListingWriteFields): Promise<{
    ok: boolean;
    error?: string;
}>;
