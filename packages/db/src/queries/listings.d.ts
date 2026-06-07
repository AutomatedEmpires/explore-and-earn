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
    cover_photo_url: string | null;
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
    coverImageUrl: string | undefined;
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
 * - Returns [] for an empty id list \u2014 PostgREST `.in(...)` with an empty array
 *   is invalid, so the guard is required.
 * - Filters on status "live", matching getPublicListingById. (There is no
 *   "published" status in this schema; "live" is the published state \u2014 see
 *   contracts LISTING_STATUS / supabase/migrations/006_listings.sql.)
 * - Result order is NOT guaranteed; callers that need a specific order should
 *   join the rows back by id (e.g. via a Map).
 */
export declare function getPublicListingsByIds(ids: string[]): Promise<ListingRow[]>;
/**
 * Filters accepted by {@link searchListings}. Every field is optional; an empty
 * filter object returns the newest live listings (the same set as
 * getPublicListings, capped by `limit`).
 */
export interface SearchFilters {
    /** Free text, matched case-insensitively against title, description, and location_display. */
    query?: string;
    /** Subset of MARKETPLACE_CATEGORIES; values outside the registry are ignored. */
    categories?: string[];
    /** When true, only listings that include housing (housing_included = true). */
    hasHousing?: boolean;
    /** When true, only listings that include meals (meals_included = true). */
    hasMeals?: boolean;
    /** Minimum pay floor in MAJOR currency units (e.g. dollars); compared to compensation_min_cents. */
    payMin?: number;
    /** Partial, case-insensitive match against location_display. */
    location?: string;
    /** Max rows to return (default 48). */
    limit?: number;
}
/**
 * Public, server-side search over live listings \u2014 no auth required (anon
 * client, same trust level as getPublicListings).
 *
 * SCHEMA NOTE: the 006_listings.sql `listings` table does NOT have the
 * `summary` / `primary_location_name` / `housing_description` /
 * `meals_description` / `pay_min` columns referenced in some early specs. This
 * implementation maps those intents onto the real columns:
 *   - free text  -> title / description / location_display
 *   - location   -> location_display
 *   - housing    -> housing_included (boolean flag; there is no free-text column)
 *   - meals      -> meals_included (boolean flag)
 *   - pay floor  -> compensation_min_cents (integer cents; payMin is given in
 *                   major units and converted via Math.round(payMin * 100))
 */
export declare function searchListings(filters: SearchFilters): Promise<ListingRow[]>;
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
    coverPhotoUrl?: string | null;
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
