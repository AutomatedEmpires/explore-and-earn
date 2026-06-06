import { authedClient } from "../client";
/** Postgres unique_violation SQLSTATE — surfaced as the already-applied case. */
const UNIQUE_VIOLATION = "23505";
/**
 * Resolve seeker_profiles.id for the authed Clerk user.
 *
 * `clerkUserId` must come from `auth().userId` — never decode it from the token.
 *
 * TYPES BRIDGE: types.gen.ts predates migration 009 (seeker_profiles.clerk_user_id),
 * so the column is accessed through an untyped client handle until types are regenerated.
 */
async function resolveSeekerProfileId(clerkToken, clerkUserId) {
    const untyped = authedClient(clerkToken);
    const { data, error } = await untyped
        .from("seeker_profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (error) {
        throw new Error(`resolveSeekerProfileId: ${error.message}`);
    }
    return data ? data.id : null;
}
/**
 * Apply the authed seeker to a listing.
 *
 * App-level ownership guard only (RLS is gated to a separate change). Expected
 * business outcomes are returned as a typed result rather than thrown:
 * - `unauthenticated`  — token had no decodable subject
 * - `profile_not_found` — no seeker_profiles row yet (Clerk webhook pending)
 * - `already_applied`   — unique (listing_id, seeker_profile_id) violation
 */
export async function applyToListing(clerkToken, clerkUserId, listingId, coverMessage) {
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId) {
        return { ok: false, error: "profile_not_found" };
    }
    const { error } = await authedClient(clerkToken)
        .from("applications")
        .insert({
        listing_id: listingId,
        seeker_profile_id: seekerProfileId,
        cover_message: coverMessage ?? null,
    });
    if (error) {
        if (error.code === UNIQUE_VIOLATION) {
            return { ok: false, error: "already_applied" };
        }
        return { ok: false, error: error.message };
    }
    return { ok: true };
}
/**
 * Listing ids the authed seeker has applied to (status != 'withdrawn').
 * Returns an empty array when the seeker has no profile yet or no applications.
 */
export async function getSeekerApplicationIds(clerkToken, clerkUserId) {
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId) {
        return [];
    }
    const { data, error } = await authedClient(clerkToken)
        .from("applications")
        .select("listing_id")
        .eq("seeker_profile_id", seekerProfileId)
        .neq("status", "withdrawn");
    if (error) {
        throw new Error(`getSeekerApplicationIds: ${error.message}`);
    }
    return (data ?? []).map((row) => row.listing_id);
}
/**
 * Full application records for the authed seeker, newest first.
 *
 * `clerkUserId` must come from `auth().userId` (already verified by Clerk
 * middleware) — never decode it from the token. Same safe pattern as the
 * savedListings functions.
 *
 * Returns an empty array when the seeker has no profile yet or no applications.
 *
 * TYPES BRIDGE: `submitted_at` predates the committed types.gen.ts (same bridge
 * as resolveSeekerProfileId), so this read goes through an UNTYPED view of the
 * authed client until the generated types are regenerated.
 */
export async function getSeekerApplications(clerkToken, clerkUserId) {
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId) {
        return [];
    }
    const untyped = authedClient(clerkToken);
    const { data, error } = await untyped
        .from("applications")
        .select("id, listing_id, status, submitted_at")
        .eq("seeker_profile_id", seekerProfileId)
        .order("submitted_at", { ascending: false });
    if (error) {
        throw new Error(`getSeekerApplications: ${error.message}`);
    }
    return (data ?? []).map((row) => ({
        id: row.id,
        listingId: row.listing_id,
        status: row.status,
        submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : "",
    }));
}
/**
 * Embedded-join select string (the single-line pattern used in queries/listings.ts).
 * `!inner` is required on the listings -> host_profiles chain so that filtering on
 * host_profiles.clerk_user_id constrains the TOP-LEVEL application rows rather than
 * merely nulling the embed (which would leak other hosts' applications).
 */
const HOST_APPLICATIONS_SELECT = "id,listing_id,seeker_profile_id,status,cover_message,submitted_at,listings!listing_id!inner(title,host_profile_id,host_profiles!host_profile_id!inner(clerk_user_id)),seeker_profiles!seeker_profile_id(clerk_user_id)";
function firstOf(value) {
    const candidate = Array.isArray(value) ? value[0] : value;
    return candidate && typeof candidate === "object"
        ? candidate
        : null;
}
/**
 * All applications across the authed host's listings, newest first.
 *
 * Scoping is an app-level ownership guard (RLS for applications is gated to a
 * separate change): we constrain to host_profiles.clerk_user_id = $clerkUserId.
 * Uses the UNTYPED client cast (same pattern as resolveSeekerProfileId) because
 * the generated types predate the clerk_user_id columns.
 *
 * Primary path uses the PostgREST embedded join; if PostgREST rejects the embed
 * (named blocker in the build brief) we fall back to discrete queries.
 */
export async function getHostApplications(clerkToken, clerkUserId) {
    const untyped = authedClient(clerkToken);
    try {
        const { data, error } = await untyped
            .from("applications")
            .select(HOST_APPLICATIONS_SELECT)
            .eq("listings.host_profiles.clerk_user_id", clerkUserId)
            .order("submitted_at", { ascending: false });
        if (error) {
            throw new Error(error.message);
        }
        return (data ?? []).map((row) => {
            const r = row;
            const listing = firstOf(r.listings);
            const seeker = firstOf(r.seeker_profiles);
            return {
                id: String(r.id),
                listingId: String(r.listing_id),
                listingTitle: listing && typeof listing.title === "string" ? listing.title : "",
                seekerProfileId: String(r.seeker_profile_id),
                seekerClerkUserId: seeker && typeof seeker.clerk_user_id === "string"
                    ? seeker.clerk_user_id
                    : "",
                status: typeof r.status === "string" ? r.status : "applied",
                coverMessage: typeof r.cover_message === "string" ? r.cover_message : null,
                submittedAt: String(r.submitted_at),
            };
        });
    }
    catch {
        return getHostApplicationsFallback(untyped, clerkUserId);
    }
}
/**
 * Discrete-query fallback for getHostApplications when the embedded join is
 * rejected: resolve host profile ids -> the host's listing ids/titles ->
 * applications on those listings -> applicant Clerk ids. Same app-level guard.
 */
async function getHostApplicationsFallback(untyped, clerkUserId) {
    const { data: hostRows, error: hostError } = await untyped
        .from("host_profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId);
    if (hostError) {
        throw new Error(`getHostApplications(host_profiles): ${hostError.message}`);
    }
    const hostProfileIds = (hostRows ?? []).map((r) => String(r.id));
    if (hostProfileIds.length === 0) {
        return [];
    }
    const { data: listingRows, error: listingError } = await untyped
        .from("listings")
        .select("id,title")
        .in("host_profile_id", hostProfileIds);
    if (listingError) {
        throw new Error(`getHostApplications(listings): ${listingError.message}`);
    }
    const listingTitleById = new Map();
    for (const raw of listingRows ?? []) {
        const r = raw;
        listingTitleById.set(String(r.id), typeof r.title === "string" ? r.title : "");
    }
    const listingIds = [...listingTitleById.keys()];
    if (listingIds.length === 0) {
        return [];
    }
    const { data: appRows, error: appError } = await untyped
        .from("applications")
        .select("id,listing_id,seeker_profile_id,status,cover_message,submitted_at")
        .in("listing_id", listingIds)
        .order("submitted_at", { ascending: false });
    if (appError) {
        throw new Error(`getHostApplications(applications): ${appError.message}`);
    }
    const apps = (appRows ?? []).map((raw) => raw);
    const seekerProfileIds = [
        ...new Set(apps.map((r) => String(r.seeker_profile_id))),
    ];
    const seekerClerkById = new Map();
    if (seekerProfileIds.length > 0) {
        const { data: seekerRows, error: seekerError } = await untyped
            .from("seeker_profiles")
            .select("id,clerk_user_id")
            .in("id", seekerProfileIds);
        if (seekerError) {
            throw new Error(`getHostApplications(seeker_profiles): ${seekerError.message}`);
        }
        for (const raw of seekerRows ?? []) {
            const r = raw;
            seekerClerkById.set(String(r.id), typeof r.clerk_user_id === "string" ? r.clerk_user_id : "");
        }
    }
    return apps.map((r) => ({
        id: String(r.id),
        listingId: String(r.listing_id),
        listingTitle: listingTitleById.get(String(r.listing_id)) ?? "",
        seekerProfileId: String(r.seeker_profile_id),
        seekerClerkUserId: seekerClerkById.get(String(r.seeker_profile_id)) ?? "",
        status: typeof r.status === "string" ? r.status : "applied",
        coverMessage: typeof r.cover_message === "string" ? r.cover_message : null,
        submittedAt: String(r.submitted_at),
    }));
}
/**
 * Application counts keyed by listing id for the authed host, e.g.
 * { [listingId]: count }. Derived from getHostApplications so the ownership
 * guard and embed/fallback behaviour stay in one place.
 */
export async function getApplicationCountsByListing(clerkToken, clerkUserId) {
    const applications = await getHostApplications(clerkToken, clerkUserId);
    const counts = {};
    for (const application of applications) {
        counts[application.listingId] = (counts[application.listingId] ?? 0) + 1;
    }
    return counts;
}
/**
 * Statuses a host is permitted to set on an application from the dashboard.
 * This is the host-facing decision vocabulary; seeker-facing values such as
 * 'applied' and 'withdrawn' are deliberately NOT settable here.
 */
const HOST_SETTABLE_STATUSES = [
    "reviewing",
    "saved_by_host",
    "offered",
    "not_selected",
];
/**
 * Host changes the status of a single application.
 *
 * Ownership is enforced in application code (RLS for applications is gated to a
 * separate change), using the same discrete-query pattern as the
 * getHostApplications fallback: resolve the caller's host_profiles id(s), load
 * the target application's listing, and confirm that listing belongs to the
 * host before writing. `clerkUserId` MUST come from auth().userId (already
 * verified by Clerk) and is never decoded from the token.
 *
 * Business outcomes are returned as a typed result rather than thrown:
 * - `invalid_status` — newStatus is not a host-settable value
 * - `profile_not_found` — caller has no host_profiles row
 * - `not_found` — application does not exist
 * - `forbidden` — application's listing is not owned by the caller
 */
export async function updateApplicationStatus(clerkToken, clerkUserId, applicationId, newStatus) {
    if (!HOST_SETTABLE_STATUSES.includes(newStatus)) {
        return { ok: false, error: "invalid_status" };
    }
    const untyped = authedClient(clerkToken);
    // 1. Resolve the caller's own host profile id(s).
    const { data: hostRows, error: hostError } = await untyped
        .from("host_profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId);
    if (hostError) {
        return { ok: false, error: hostError.message };
    }
    const hostProfileIds = new Set((hostRows ?? []).map((r) => String(r.id)));
    if (hostProfileIds.size === 0) {
        return { ok: false, error: "profile_not_found" };
    }
    // 2. Load the target application's listing.
    const { data: appRow, error: appError } = await untyped
        .from("applications")
        .select("id,listing_id")
        .eq("id", applicationId)
        .maybeSingle();
    if (appError) {
        return { ok: false, error: appError.message };
    }
    if (!appRow) {
        return { ok: false, error: "not_found" };
    }
    // 3. Confirm that listing belongs to one of the caller's host profiles.
    const listingId = String(appRow.listing_id);
    const { data: listingRow, error: listingError } = await untyped
        .from("listings")
        .select("id,host_profile_id")
        .eq("id", listingId)
        .maybeSingle();
    if (listingError) {
        return { ok: false, error: listingError.message };
    }
    if (!listingRow ||
        !hostProfileIds.has(String(listingRow.host_profile_id))) {
        return { ok: false, error: "forbidden" };
    }
    // 4. Apply the status change.
    const { error: updateError } = await untyped
        .from("applications")
        .update({ status: newStatus })
        .eq("id", applicationId);
    if (updateError) {
        return { ok: false, error: updateError.message };
    }
    return { ok: true };
}
/**
 * Build the bucket-card compensation display from the embedded listing fields.
 * Mirrors buildCompensationSummary in queries/listings.ts but operates on the
 * narrower embedded select (no currency column is selected, so USD is assumed).
 */
function embeddedCompensationSummary(row) {
    if (typeof row.compensation_summary === "string" &&
        row.compensation_summary.length > 0) {
        return row.compensation_summary;
    }
    const minCents = typeof row.compensation_min_cents === "number"
        ? row.compensation_min_cents
        : null;
    if (minCents != null) {
        const unit = typeof row.compensation_unit === "string"
            ? row.compensation_unit
            : "other";
        const fmt = (cents) => new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
        }).format(cents / 100);
        const min = fmt(minCents);
        const maxCents = typeof row.compensation_max_cents === "number"
            ? row.compensation_max_cents
            : null;
        const max = maxCents != null ? fmt(maxCents) : null;
        const range = max && max !== min ? `${min}\u2013${max}` : min;
        return unit === "other" || unit === "exchange" || unit === "stipend"
            ? range
            : `${range}/${unit}`;
    }
    return "Negotiable";
}
/**
 * Map an embedded `listings` row (from the getSeekerApplicationsWithListings
 * select) to the ApplicationListing view-model. Modeled on rowToDiscoveryFields
 * in queries/listings.ts so the produced object is shape-compatible with the
 * canonical DiscoveryCard. Returns null when the embed is absent.
 *
 * NOTE: the embedded select intentionally omits host_profiles and the listing
 * status/currency columns, so host name/verification default to a neutral
 * placeholder and status defaults to "live". See PR notes for the follow-up to
 * surface the real host + listing status here.
 */
function rowToDiscoveryListing(value) {
    const row = firstOf(value);
    if (!row) {
        return null;
    }
    const housingProvision = row.housing_included === true ? "provided" : "not_provided";
    const mealsProvision = row.meals_included === true ? "provided" : "not_provided";
    const benefits = {
        housing: { provision: housingProvision },
        meals: { provision: mealsProvision },
        pay: {
            provision: "provided",
            summary: embeddedCompensationSummary(row),
        },
    };
    return {
        id: String(row.id),
        title: typeof row.title === "string" ? row.title : "",
        category: (typeof row.category === "string"
            ? row.category
            : "mix"),
        location: typeof row.location_display === "string" &&
            row.location_display.length > 0
            ? row.location_display
            : "Location not specified",
        opportunityWindow: typeof row.timeline_summary === "string" &&
            row.timeline_summary.length > 0
            ? row.timeline_summary
            : "Open",
        status: (typeof row.status === "string"
            ? row.status
            : "live"),
        host: { name: "Unknown Host", verified: false },
        benefits,
    };
}
/**
 * Applications for the authed seeker filtered to the given statuses, each joined
 * to its listing view-model for the status-bucket surfaces (/offered,
 * /accepted, /not-selected). Newest first.
 *
 * `clerkUserId` MUST come from auth().userId (already verified by Clerk) — never
 * decoded from the token. Same UNTYPED-client bridge as getSeekerApplications
 * (submitted_at / clerk_user_id predate the committed types.gen.ts).
 *
 * Returns an empty array when the seeker has no profile yet, no matching
 * applications, or an empty `statuses` list.
 */
export async function getSeekerApplicationsWithListings(clerkToken, clerkUserId, statuses) {
    if (statuses.length === 0) {
        return [];
    }
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId) {
        return [];
    }
    const untyped = authedClient(clerkToken);
    const { data, error } = await untyped
        .from("applications")
        .select("id, listing_id, status, submitted_at, listings!listing_id(id, title, category, location_display, housing_included, meals_included, compensation_summary, compensation_min_cents, compensation_max_cents, compensation_unit, timeline_summary)")
        .eq("seeker_profile_id", seekerProfileId)
        .in("status", statuses)
        .order("submitted_at", { ascending: false });
    if (error) {
        throw new Error(`getSeekerApplicationsWithListings: ${error.message}`);
    }
    return (data ?? []).map((raw) => {
        const r = raw;
        return {
            id: String(r.id),
            listingId: String(r.listing_id),
            status: typeof r.status === "string" ? r.status : "applied",
            submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
            listing: rowToDiscoveryListing(r.listings),
        };
    });
}
