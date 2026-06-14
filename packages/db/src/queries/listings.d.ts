import "server-only";
import type { BenefitProvision, CompensationUnit, ListingStatus, OpportunityCategory, OpportunityListing } from "@explore-and-earn/contracts";
export interface ListingRow {
    id: string;
    host_profile_id: string | null;
    title: string;
    category: OpportunityCategory;
    description: string | null;
    location_display: string | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    housing_included: boolean;
    meals_included: boolean;
    visa_support: boolean;
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
    gallery_photo_urls: string[] | null;
    host_profiles: {
        company_name: string;
        attestation_status: string;
    } | null;
}
/** Maps a ListingRow to the DiscoveryListing view-model fields. */
export declare function rowToDiscoveryFields(row: ListingRow): OpportunityListing;
/** Max cards returned per swipe-deck page (Task 1/Task 3 batch size). */
export declare const SWIPE_BATCH_SIZE = 20;
/** Public live listings \u2014 no auth required. */
export declare function getPublicListings(): Promise<ListingRow[]>;
/** Single live listing by id \u2014 no auth required. */
export declare function getPublicListingById(id: string): Promise<ListingRow | null>;
/**
 * Batch variant of getPublicListingById: fetch many live listings in a single
 * query instead of one round-trip per id (eliminates the N+1 on the
 * saved/applied/messages surfaces). No auth required (public listings).
 */
export declare function getPublicListingsByIds(ids: string[]): Promise<ListingRow[]>;
/**
 * Swipe-deck batch for the authenticated seeker (/swipe surface).
 *
 * Returns up to SWIPE_BATCH_SIZE live listings, newest-first with a stable
 * (published_at DESC, id DESC) order so cursor pagination below is
 * deterministic. Excludes:
 *   - every id in `excludeIds` (cards already seen this session + the seeker's
 *     saved ids passed by the caller), and
 *   - every listing the seeker has already applied to (resolved server-side via
 *     getSeekerApplicationIds \u2014 never trust a client-supplied applied set).
 *
 * `clerkUserId` MUST come from auth().userId \u2014 never decoded from the token.
 * `cursor` is the published_at of the last row from the previous page; when
 * present we fetch strictly older rows via .lt("published_at", cursor).
 *
 * Best-effort on the applied filter: a seeker with no profile resolves to [] so
 * nothing is excluded on that axis.
 */
export declare function getSwipeBatch(clerkToken: string, clerkUserId: string, excludeIds: string[], cursor?: string): Promise<ListingRow[]>;
/**
 * All live listings that carry geocoordinates, newest-first \u2014 backs the seeker
 * /map surface. latitude/longitude are the real columns (the brief's lat/lng);
 * rows missing either are filtered out so every result is mappable.
 *
 * Public data (same trust level as getPublicListings). Pass a Clerk token to go
 * through the authed client, or omit it to use the anon client (the map is a
 * public read).
 */
export declare function getLiveListingsWithCoords(clerkToken?: string): Promise<ListingRow[]>;
/**
 * Filters accepted by {@link searchListings}. Every field is optional; an empty
 * filter object returns the newest live listings (the same set as
 * getPublicListings, capped by `limit`).
 *
 * startDateAfter / startDateBefore filter on the listing `begins_at` column
 * (ISO date or timestamp strings). `offset` opts into range-based pagination;
 * when omitted the query falls back to a simple `.limit(limit)`.
 */
export interface SearchFilters {
    query?: string;
    categories?: string[];
    hasHousing?: boolean;
    hasMeals?: boolean;
    visaSupport?: boolean;
    startRangeMonths?: 1 | 3 | 6;
    payMin?: number;
    payUnit?: CompensationUnit;
    location?: string;
    startDateAfter?: string;
    startDateBefore?: string;
    limit?: number;
    offset?: number;
}
export declare function searchListings(filters: SearchFilters): Promise<ListingRow[]>;
export declare function getHostListings(clerkToken: string, clerkUserId: string): Promise<ListingRow[]>;
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
    galleryUrls?: string[] | null;
}
export declare function createListing(clerkToken: string, clerkUserId: string, fields: ListingWriteFields): Promise<{
    ok: boolean;
    listingId?: string;
    error?: string;
}>;
export declare function updateListing(clerkToken: string, clerkUserId: string, listingId: string, fields: ListingWriteFields): Promise<{
    ok: boolean;
    error?: string;
}>;
export declare function updateListingStatus(clerkToken: string, clerkUserId: string, listingId: string, status: "live" | "paused" | "archived"): Promise<{
    ok: boolean;
    error?: string;
}>;
/**
 * Joined host_profiles fields on a public listing detail. id is needed to
 * link /host/{id} and generate hiringOrganization JSON-LD.
 */
export interface PublicListingDetailHost {
    id: string;
    companyName: string;
    photoUrl: string | null;
    about: string | null;
    primaryLocationName: string | null;
    attestationStatus: string;
}
/**
 * A single listing for the public detail page, joined to its host_profiles row.
 *
 * Does NOT filter on status — the page layer decides visibility (non-live
 * listings are only shown to the owning host). Uses the anon client.
 */
export interface PublicListingDetail {
    id: string;
    title: string;
    category: OpportunityCategory;
    description: string | null;
    locationDisplay: string | null;
    latitude: number | null;
    longitude: number | null;
    status: ListingStatus;
    housingIncluded: boolean;
    mealsIncluded: boolean;
    compensationSummary: string | null;
    compensationMinCents: number | null;
    compensationMaxCents: number | null;
    compensationUnit: string | null;
    compensationCurrency: string;
    timelineSummary: string | null;
    beginsAt: string | null;
    endsAt: string | null;
    publishedAt: string | null;
    coverPhotoUrl: string | null;
    galleryPhotoUrls: string[];
    hostProfileId: string | null;
    host: PublicListingDetailHost | null;
}
/**
 * Fetch a listing for the public detail page. No status filter — the page
 * decides who may view non-live listings. Anon client (no auth required).
 */
export declare function getListingDetailPublic(listingId: string): Promise<PublicListingDetail | null>;
/**
 * Whether the authed seeker has an active (non-withdrawn) application to a
 * listing. Returns false when the seeker has no profile yet.
 * `clerkUserId` must come from auth().userId.
 */
export declare function hasApplied(clerkToken: string, clerkUserId: string, listingId: string): Promise<boolean>;
/**
 * Whether the authed seeker has actively saved a listing (status='saved').
 * `clerkUserId` must come from auth().userId.
 */
export declare function hasSaved(clerkToken: string, clerkUserId: string, listingId: string): Promise<boolean>;
/**
 * Distinct host_profile_id values with at least one live listing.
 * Used to populate host-profile entries in the sitemap. Anon client.
 */
export declare function getHostIdsWithLiveListings(): Promise<string[]>;
