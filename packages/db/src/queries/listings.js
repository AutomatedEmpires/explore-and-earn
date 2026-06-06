import { anonClient, authedClient } from "../client";
function formatOpportunityWindow(row) {
    if (row.timeline_summary)
        return row.timeline_summary;
    if (row.begins_at && row.ends_at) {
        const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
        return `${fmt(row.begins_at)}–${fmt(row.ends_at)}`;
    }
    return "Open";
}
function buildCompensationSummary(row) {
    if (row.compensation_summary)
        return row.compensation_summary;
    const unit = row.compensation_unit ?? "other";
    const currency = row.compensation_currency;
    if (row.compensation_min_cents != null) {
        const fmt = (cents) => new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
        }).format(cents / 100);
        const min = fmt(row.compensation_min_cents);
        const max = row.compensation_max_cents != null ? fmt(row.compensation_max_cents) : null;
        const range = max && max !== min ? `${min}–${max}` : min;
        return unit === "other" || unit === "exchange" || unit === "stipend"
            ? range
            : `${range}/${unit}`;
    }
    return "Negotiable";
}
function toListingRow(raw) {
    return { ...raw, category: raw.category };
}
/** Maps a ListingRow to the DiscoveryListing view-model fields. */
export function rowToDiscoveryFields(row) {
    const hostName = row.host_profiles?.company_name ?? "Unknown Host";
    const verified = row.host_profiles?.attestation_status === "verified";
    const housingProvision = row.housing_included ? "provided" : "not_provided";
    const mealsProvision = row.meals_included ? "provided" : "not_provided";
    return {
        id: row.id,
        title: row.title,
        category: row.category,
        location: row.location_display ?? "Location not specified",
        opportunityWindow: formatOpportunityWindow(row),
        status: row.status,
        host: { name: hostName, verified },
        benefits: {
            housing: { provision: housingProvision },
            meals: { provision: mealsProvision },
            pay: {
                provision: "provided",
                summary: buildCompensationSummary(row),
            },
        },
    };
}
const LISTING_COLUMNS = "id,title,category,location_display,latitude,longitude,status,housing_included,meals_included,compensation_summary,compensation_min_cents,compensation_max_cents,compensation_unit,compensation_currency,timeline_summary,begins_at,ends_at,published_at,host_profiles(company_name,attestation_status)";
/** Public live listings — no auth required. */
export async function getPublicListings() {
    const { data, error } = await anonClient()
        .from("listings")
        .select(LISTING_COLUMNS)
        .eq("status", "live")
        .order("published_at", { ascending: false });
    if (error)
        throw new Error(`getPublicListings: ${error.message}`);
    return (data ?? []).map(toListingRow);
}
/** Single live listing by id — no auth required. */
export async function getPublicListingById(id) {
    const { data, error } = await anonClient()
        .from("listings")
        .select(LISTING_COLUMNS)
        .eq("id", id)
        .eq("status", "live")
        .maybeSingle();
    if (error)
        throw new Error(`getPublicListingById: ${error.message}`);
    return data ? toListingRow(data) : null;
}
/**
 * Resolve the host_profiles.id for the authenticated Clerk user.
 * Returns null when the user has no host profile yet.
 *
 * `clerkUserId` must come from `auth().userId` — never decoded from the token.
 */
async function resolveHostProfileId(clerkToken, clerkUserId) {
    const untyped = authedClient(clerkToken);
    const { data, error } = await untyped
        .from("host_profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (error)
        throw new Error(`resolveHostProfileId: ${error.message}`);
    return data ? data.id : null;
}
/**
 * Host's own listings — requires Clerk JWT + verified Clerk user id.
 *
 * Scoped to `host_profile_id` so a host can only read their own listings.
 * `clerkUserId` must come from `auth().userId`.
 */
export async function getHostListings(clerkToken, clerkUserId) {
    const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
    if (!hostProfileId)
        return [];
    const { data, error } = await authedClient(clerkToken)
        .from("listings")
        .select(LISTING_COLUMNS)
        .eq("host_profile_id", hostProfileId)
        .order("created_at", { ascending: false });
    if (error)
        throw new Error(`getHostListings: ${error.message}`);
    return (data ?? []).map(toListingRow);
}
